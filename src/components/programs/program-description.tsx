import { Fragment, type ReactNode } from "react";
export function safeDescriptionLink(value: string) {
  if (/^\/(?!\/)[a-zA-Z0-9/_?=&%#.-]*$/.test(value)) return value;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function inline(text: string): ReactNode[] {
  // No raw HTML, image syntax, embeds, style attributes or dangerouslySetInnerHTML.
  return text
    .split(/(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
    .map((part, i) => {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        const href = safeDescriptionLink(link[2]);
        return href ? (
          <a key={i} href={href} rel="noopener noreferrer">
            {link[1]}
          </a>
        ) : (
          <Fragment key={i}>{link[1]}</Fragment>
        );
      }
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*") && part.endsWith("*"))
        return <em key={i}>{part.slice(1, -1)}</em>;
      return <Fragment key={i}>{part}</Fragment>;
    });
}
export function ProgramDescription({ text }: { text: string }) {
  const lines = text.slice(0, 20000).replace(/\r/g, "").split("\n"),
    blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    const heading = /^#{1,3} (.+)$/.exec(line);
    if (heading) {
      blocks.push(<h3 key={i}>{inline(heading[1])}</h3>);
      i++;
      continue;
    }
    if (/^(?:- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line),
        start = i,
        items: ReactNode[] = [];
      while (
        i < lines.length &&
        (ordered ? /^\d+\. / : /^- /).test(lines[i].trim())
      ) {
        items.push(
          <li key={i}>
            {inline(lines[i].trim().replace(/^(?:- |\d+\. )/, ""))}
          </li>,
        );
        i++;
      }
      blocks.push(
        ordered ? <ol key={start}>{items}</ol> : <ul key={start}>{items}</ul>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
      i++;
      continue;
    }
    const start = i,
      paragraph = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(?:#{1,3} |>|- |\d+\. )/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push(<p key={start}>{inline(paragraph.join(" "))}</p>);
  }
  return <div className="program-prose">{blocks}</div>;
}
