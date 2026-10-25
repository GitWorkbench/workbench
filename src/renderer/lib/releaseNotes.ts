export function formatReleaseNotes(notes: string): string {
  if (!/<\/?[a-z][\s\S]*?>/i.test(notes)) return notes;

  const template = document.createElement('template');
  template.innerHTML = notes;
  template.content.querySelectorAll('script, style').forEach((node) => node.remove());
  template.content.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  template.content.querySelectorAll('li').forEach((node) => {
    node.insertBefore(document.createTextNode('• '), node.firstChild);
    node.append(document.createTextNode('\n'));
  });
  template.content.querySelectorAll('p, h1, h2, h3, h4, blockquote').forEach((node) => {
    node.append(document.createTextNode('\n\n'));
  });

  return (template.content.textContent || '')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
