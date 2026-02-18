// src/components/MatchScoreRing.jsx
// Circular progress ring showing candidate match score

const SCORE_COLORS = {
    high: { stroke: '#22c55e', text: 'text-green-400' },     // 85+
    good: { stroke: '#3b82f6', text: 'text-electric' },      // 70-84
    medium: { stroke: '#f59e0b', text: 'text-amber-400' },   // 50-69
    low: { stroke: '#ef4444', text: 'text-red-400' },        // <50
};

function getScoreLevel(score) {
    if (score >= 85) return 'high';
    if (score >= 70) return 'good';
    if (score >= 50) return 'medium';
    return 'low';
}

export default function MatchScoreRing({ score = 0, size = 52 }) {
    const level = getScoreLevel(score);
    const colors = SCORE_COLORS[level];
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="score-ring" style={{ width: size, height: size }}>
            <svg style={{ width: size, height: size }}>
                <circle
                    className="score-ring__bg"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                />
                <circle
                    className="score-ring__fill"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={colors.stroke}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ animation: 'progress-fill 1.2s ease-out' }}
                />
            </svg>
            <span className={`score-ring__text ${colors.text} font-bold`}>
                {score}
            </span>
        </div>
    );
}
