import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { Layout } from './Layout';
import { NotFound } from './NotFound';

// Pages secondaires chargées à la demande (SheetJS n'est téléchargé que pour l'import/export).
const SpoolDetailPage = lazy(() =>
  import('@/features/inventory/SpoolDetailPage').then((m) => ({ default: m.SpoolDetailPage })),
);
const PrintsPage = lazy(() =>
  import('@/features/prints/PrintsPage').then((m) => ({ default: m.PrintsPage })),
);
const CatalogPage = lazy(() =>
  import('@/features/catalog/CatalogPage').then((m) => ({ default: m.CatalogPage })),
);
const ImportExportPage = lazy(() =>
  import('@/features/import-export/ImportExportPage').then((m) => ({ default: m.ImportExportPage })),
);
const AmsPage = lazy(() => import('@/features/ams/AmsPage').then((m) => ({ default: m.AmsPage })));
const WeighPage = lazy(() => import('@/features/weighing/WeighPage').then((m) => ({ default: m.WeighPage })));
const JournalPage = lazy(() =>
  import('@/features/journal/JournalPage').then((m) => ({ default: m.JournalPage })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ProjectsPage = lazy(() =>
  import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
);
const AlertsPage = lazy(() =>
  import('@/features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })),
);
const ShoppingPage = lazy(() =>
  import('@/features/shopping/ShoppingPage').then((m) => ({ default: m.ShoppingPage })),
);
const ProjectDetailPage = lazy(() =>
  import('@/features/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
);
const ProjectDocumentPage = lazy(() =>
  import('@/features/projects/ProjectDocumentPage').then((m) => ({ default: m.ProjectDocumentPage })),
);
const QuickFeasibilityPage = lazy(() =>
  import('@/features/projects/QuickFeasibilityPage').then((m) => ({ default: m.QuickFeasibilityPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

const page = (node: ReactNode) => (
  <Suspense fallback={<p className="text-muted-foreground">Chargement…</p>}>{node}</Suspense>
);

// Router en mode hash : fonctionne tel quel sur GitHub Pages (aucune réécriture d'URL côté serveur).
const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <InventoryPage /> },
      { path: 'spools/:id', element: page(<SpoolDetailPage />) },
      { path: 'prints', element: page(<PrintsPage />) },
      { path: 'ams', element: page(<AmsPage />) },
      { path: 'weigh', element: page(<WeighPage />) },
      { path: 'journal', element: page(<JournalPage />) },
      { path: 'dashboard', element: page(<DashboardPage />) },
      { path: 'projects', element: page(<ProjectsPage />) },
      { path: 'projects/:id', element: page(<ProjectDetailPage />) },
      { path: 'projects/:id/document', element: page(<ProjectDocumentPage />) },
      { path: 'feasibility', element: page(<QuickFeasibilityPage />) },
      { path: 'alerts', element: page(<AlertsPage />) },
      { path: 'shopping', element: page(<ShoppingPage />) },
      { path: 'catalog', element: page(<CatalogPage />) },
      { path: 'data', element: page(<ImportExportPage />) },
      { path: 'settings', element: page(<SettingsPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
