/**
 * Dashboard: one entry, a different home for each role.
 *  - branch manager: a prioritised, grouped task list computed by the server
 *  - head office: headcount, year-cycle progress per branch, recent departures
 *  - branch operations manager: assigned branches and their missing documents
 */
import { useAuth } from '../contexts/AuthContext';
import BranchDashboard from './dashboard/BranchDashboard.jsx';
import MainDashboard from './dashboard/MainDashboard.jsx';
import OpsDashboard from './dashboard/OpsDashboard.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'main_manager') return <MainDashboard />;
  if (user?.role === 'branch_manager') return <BranchDashboard />;
  return <OpsDashboard />;
}
