/**
 * Dashboard: one entry, a different home for each role.
 *  - branch manager: a prioritised, grouped task list computed by the server
 *  - head office: headcount, year-cycle progress per branch, recent departures
 *  - branch operations manager: the original documents overview (unchanged)
 */
import { useAuth } from '../contexts/AuthContext';
import BranchDashboard from './dashboard/BranchDashboard.jsx';
import MainDashboard from './dashboard/MainDashboard.jsx';
import LegacyDashboard from './LegacyDashboard.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'main_manager') return <MainDashboard />;
  if (user?.role === 'branch_manager') return <BranchDashboard />;
  return <LegacyDashboard />;
}
