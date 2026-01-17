import PayrollAbsenceBranch from '../pages/PayrollAbsenceBranch.jsx';

// Thin wrapper to reuse the branch payroll absence UI as a dashboard section
const PayrollAbsenceBranchSection = ({ onComplete }) => {
  return <PayrollAbsenceBranch onComplete={onComplete} />;
};

export default PayrollAbsenceBranchSection;
