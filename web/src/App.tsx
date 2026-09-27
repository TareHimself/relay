import { Route, Routes } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { DocRedirect } from './routes/DocRedirect'
import { DocRoute } from './routes/DocRoute'
import { Landing } from './routes/Landing'
import { ProjectHome } from './routes/ProjectHome'
import { SettingsRoute } from './routes/SettingsRoute'

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Landing />} />
        <Route path="settings" element={<SettingsRoute />} />
        <Route path="doc/:docId" element={<DocRedirect />} />
        <Route path="projects/:projectId" element={<ProjectHome />} />
        <Route path="projects/:projectId/docs/:docId" element={<DocRoute />} />
      </Route>
    </Routes>
  )
}
