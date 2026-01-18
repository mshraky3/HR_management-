import React, { useMemo } from 'react';
import { calculateDocumentsCompletion, calculateOverallProgress } from '../utils/dataCompletionUtils';
import '../pages/BranchStatistics.css';
import getBranchColor from '../utils/branchColors';

const BranchesOverallProgressChart = ({
    statistics = [],
    documentsList = [],
    branchDocumentsMap = null,
    title = 'التقدم الإجمالي لجميع الفروع'
}) => {
    // Build documents map if not provided
    const documentsByBranch = useMemo(() => {
        if (branchDocumentsMap) return branchDocumentsMap;
        const map = {};
        (documentsList || []).forEach(doc => {
            const bid = doc.branch_id || doc.branch_id || doc.branchId || doc.branch_id;
            if (!map[bid]) map[bid] = [];
            map[bid].push(doc);
        });
        return map;
    }, [documentsList, branchDocumentsMap]);

    if (!statistics || statistics.length === 0) {
        return null;
    }

    const calcBranchOverall = (stat) => {
        const employeesCompletion = Number(stat.completion_percentage) || 0;
        const docs = documentsByBranch[stat.branch_id] || [];
        const docMetrics = calculateDocumentsCompletion(docs, stat.branch_type);
        return calculateOverallProgress(employeesCompletion, docMetrics.percentage);
    };

    const branchesForChart = statistics
        .slice()
        .sort((a, b) => calcBranchOverall(b) - calcBranchOverall(a));

    const overallAvg = branchesForChart.length > 0
        ? Math.round(branchesForChart.reduce((sum, s) => sum + calcBranchOverall(s), 0) / branchesForChart.length)
        : 0;



    return (
        <div className="chart-section dashboard-branch-chart">
            <div className="chart-header-section">
                <h2>{title}</h2>
                <div className="chart-summary-stats">
                    <div className="summary-stat-item">
                        <span className="summary-stat-label">المتوسط:</span>
                        <span className="summary-stat-value">{overallAvg}%</span>
                    </div>
                    <div className="summary-stat-item">
                        <span className="summary-stat-label">إجمالي الفروع:</span>
                        <span className="summary-stat-value">{branchesForChart.length}</span>
                    </div>
                </div>
            </div>

            <div className="combined-chart-container">
                <div className="chart-legend">
                    {branchesForChart.map((stat, idx) => {
                        const val = calcBranchOverall(stat);
                        const { bg } = getBranchColor(stat.branch_id || stat.branch_name || idx);
                        return (
                            <div key={stat.branch_id} className="legend-item">
                                <div className="legend-color" style={{ backgroundColor: bg, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
                                <span className="legend-label">{stat.branch_name}</span>
                                <span className="legend-total">({val}%)</span>
                            </div>
                        );
                    })}
                </div>

                <div className="chart-wrapper progress-chart-wrapper">
                    <div className="chart-y-axis">
                        {[0, 25, 50, 75, 100].map(v => (
                            <div key={v} className="y-axis-label">
                                <span className="y-axis-value">{v}%</span>
                                {v > 0 && <div className="y-axis-line" />}
                            </div>
                        ))}
                    </div>

                    <div className="chart-bars-container">
                        <div className="chart-bars combined-bars progress-bars">
                            {branchesForChart.map((stat, idx) => {
                                const overall = calcBranchOverall(stat);
                                const { bg, textColor } = getBranchColor(stat.branch_id || stat.branch_name || idx);
                                return (
                                    <div key={stat.branch_id} className="chart-month-group progress-bar-group">
                                        <div className="month-bars-container">
                                            <div className="combined-bar-wrapper">
                                                <div
                                                    className="combined-bar progress-bar-enhanced"
                                                    style={{
                                                        height: `${Math.max(overall, overall > 0 ? 3 : 0)}%`,
                                                        backgroundColor: bg,
                                                        maxHeight: '100%'
                                                    }}
                                                    title={`${stat.branch_name}: التقدم الإجمالي ${overall}%`}
                                                >
                                                    {overall > 5 && <span className="combined-bar-value" style={{ color: textColor }}>{overall}%</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BranchesOverallProgressChart;
