export function QuestionHeader({eyebrow, title, description}: {eyebrow: string; title: string; description: string}) {
  return (
    <header className="question-header">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <span>{description}</span>
    </header>
  );
}
