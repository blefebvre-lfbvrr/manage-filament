/**
 * npm run bambu-live — suivi en temps réel (facultatif) via le broker MQTT du cloud Bambu Lab.
 * Affiche l'état de chaque imprimante, écrit sync-bambu/out/live.json, et lance une synchro de
 * l'historique (npm run sync-bambu) dès qu'une impression se termine, si DATA_REPO_TOKEN est défini.
 *
 * Broker : us.mqtt.bambulab.com:8883 (cn.mqtt.bambulab.com en Chine), utilisateur u_<uid>,
 * mot de passe = token Bambu, sujet device/<numéro de série>/report. API non officielle.
 * Ctrl+C pour arrêter. Aucun identifiant n'est affiché.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';
import { BambuApiError, getJson, type Region } from './api.ts';
import {
  describe,
  EMPTY_LIVE,
  finished,
  mergeReport,
  PUSHALL,
  watchdog,
  type LiveState,
} from './live-state.ts';
import { loadSecrets } from './secrets.ts';

const BROKER: Record<Region, string> = {
  global: 'mqtts://us.mqtt.bambulab.com:8883',
  china: 'mqtts://cn.mqtt.bambulab.com:8883',
};

interface Device {
  serial: string;
  name: string;
}

async function devices(region: Region, token: string): Promise<Device[]> {
  const j = (await getJson(region, token, '/v1/iot-service/api/user/bind')) as { devices?: unknown[] };
  return (j.devices ?? []).flatMap((d) => {
    const o = d as Record<string, unknown>;
    return typeof o.dev_id === 'string' ? [{ serial: o.dev_id, name: String(o.name ?? 'Imprimante') }] : [];
  });
}

async function userId(region: Region, token: string): Promise<string> {
  const j = (await getJson(region, token, '/v1/design-user-service/my/preference')) as { uid?: unknown };
  if (j.uid === undefined || j.uid === null)
    throw new Error('Identifiant utilisateur introuvable dans la réponse.');
  return String(j.uid);
}

async function main() {
  const local = loadSecrets();
  const token = process.env.BAMBU_TOKEN || local?.token;
  const region: Region = (process.env.BAMBU_REGION || local?.region) === 'china' ? 'china' : 'global';
  if (!token) {
    console.error('Pas de token : lance d’abord « npm run bambu-login ».');
    process.exit(1);
  }
  const [uid, devs] = await Promise.all([userId(region, token), devices(region, token)]);
  if (!devs.length) {
    console.error('Aucune imprimante liée à ce compte.');
    process.exit(1);
  }
  console.log(`${devs.length} imprimante(s) : ${devs.map((d) => d.name).join(', ')}. Connexion au broker…`);

  const outDir = fileURLToPath(new URL('./out/', import.meta.url));
  mkdirSync(outDir, { recursive: true });
  const states = new Map<string, LiveState>(devs.map((d) => [d.serial, EMPTY_LIVE]));
  let last = Date.now();
  let syncing = false;

  const client = mqtt.connect(BROKER[region], {
    username: `u_${uid}`,
    password: token,
    reconnectPeriod: 5_000,
    connectTimeout: 20_000,
    keepalive: 30,
    clientId: `filatrack_${Math.random().toString(16).slice(2, 10)}`,
  });
  const pushall = () => {
    for (const d of devs) client.publish(`device/${d.serial}/request`, JSON.stringify(PUSHALL));
  };

  client.on('connect', () => {
    console.log('Connecté.');
    last = Date.now();
    client.subscribe(devs.map((d) => `device/${d.serial}/report`));
    pushall();
  });
  client.on('reconnect', () => console.log('Reconnexion…'));
  client.on('error', (e) => {
    const msg = /not authori[sz]ed|bad user/i.test(e.message) ? 'refusée (token expiré ?)' : e.message;
    console.error(`Erreur MQTT : ${msg}`);
  });
  client.on('message', (topic, payload) => {
    last = Date.now();
    const serial = topic.split('/')[1]!;
    const dev = devs.find((d) => d.serial === serial);
    const prev = states.get(serial) ?? EMPTY_LIVE;
    let msg: unknown;
    try {
      msg = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    const next = mergeReport(prev, msg);
    states.set(serial, next);
    if (describe(prev) !== describe(next)) console.log(`${dev?.name ?? 'Imprimante'} : ${describe(next)}`);
    writeFileSync(
      `${outDir}live.json`,
      JSON.stringify(
        devs.map((d) => ({ name: d.name, ...states.get(d.serial) })),
        null,
        2,
      ),
    );
    const end = finished(prev, next);
    if (end && process.env.DATA_REPO_TOKEN && !syncing) {
      syncing = true;
      console.log(`Impression terminée (${end}) : synchro de l’historique dans 60 s…`);
      // Le cloud met quelques secondes à publier la tâche dans l'historique.
      setTimeout(() => {
        import('./sync.ts')
          .then((m) => m.main())
          .catch((e: unknown) => console.error(e instanceof Error ? e.message : e))
          .finally(() => (syncing = false));
      }, 60_000);
    }
  });

  const timer = setInterval(() => {
    const w = watchdog(last, Date.now());
    if (w === 'pushall' && client.connected) pushall();
    if (w === 'reconnect') {
      console.log('Plus aucun message depuis 3 min : reconnexion forcée.');
      last = Date.now();
      client.end(true, {}, () => client.reconnect());
    }
  }, 30_000);

  process.on('SIGINT', () => {
    clearInterval(timer);
    client.end(true, {}, () => process.exit(0));
  });
}

main().catch((e: unknown) => {
  if (e instanceof BambuApiError && e.status === 401) {
    console.error('Token Bambu expiré : relance « npm run bambu-login ».');
    process.exit(2);
  }
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
