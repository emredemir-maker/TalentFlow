const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'CandidateProcessPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const searchRegex = /<InterviewHistory\s*sessions=\{candidate\.interviewSessions\}\s*onStartSession=\{\(session\) => \{\s*navigate\(`\/interview\/\$\{session\.id\}`\);\s*\}\}\s*\/>/g;

const replaceStr = `<InterviewHistory
                                                sessions={candidate.interviewSessions}
                                                onStartSession={(session) => {
                                                    navigate(\`/interview/\${session.id}\`);
                                                }}
                                                onDeleteSession={async (session) => {
                                                    if (window.confirm('Bu mülakatı silmek veya iptal etmek istediğinize emin misiniz?')) {
                                                        const newSessions = candidate.interviewSessions.filter(s => s.id !== session.id);
                                                        await updateCandidate(candidate.id, { interviewSessions: newSessions });
                                                    }
                                                }}
                                            />`;

if (searchRegex.test(content)) {
    content = content.replace(searchRegex, replaceStr);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully updated InterviewHistory');
} else {
    console.log('Regex did not match.');
}
