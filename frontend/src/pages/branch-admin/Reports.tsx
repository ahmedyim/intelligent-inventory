import BranchSnapshot from '@/features/reports/BranchSnapshot';
import ReportsPage from '@/features/reports/ReportsPage';

export default function BranchReports() {
    return (
        <div className="space-y-8">
            <BranchSnapshot />
            <ReportsPage />
        </div>
    );
}