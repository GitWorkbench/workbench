import { ChangelogResult, ChangelogCategory } from '../../shared/types';
import { withGit } from './core';

export async function generateChangelog(
  repoPath: string,
  fromRef: string,
  toRef?: string
): Promise<ChangelogResult | null> {
  return await withGit(repoPath, async (git) => {
    try {
      const targetRef = toRef || 'HEAD';
      const range = fromRef ? `${fromRef}..${targetRef}` : targetRef;
      const logArgs = ['log', '--format=%H%x00%h%x00%s%x00%an%x00%ci', range];
      if (!fromRef) {
        logArgs.push('-n', '50');
      }

      const out = await git.raw(logArgs);
      const lines = out.split('\n').filter((l) => l.trim().length > 0);

      const categoryMap = new Map<string, { hash: string; shortHash: string; message: string; author: string }[]>();

      const CATEGORY_NAMES: Record<string, string> = {
        feat: '✨ Features',
        fix: '🐛 Bug Fixes',
        perf: '⚡ Performance Improvements',
        refactor: '♻️ Code Refactoring',
        docs: '📝 Documentation',
        style: '💄 Styles',
        test: '✅ Tests',
        build: '📦 Build System',
        ci: '👷 Continuous Integration',
        chore: '🔧 Maintenance & Chores',
        revert: '⏪ Reverts'
      };

      for (const line of lines) {
        const parts = line.split('\0');
        if (parts.length < 4) continue;
        const [hash, shortHash, message, author] = parts;

        // Parse conventional commit type: feat(...): message or feat: message
        const match = message.match(/^([a-zA-Z]+)(?:\([^\)]+\))?!?:/);
        let categoryTitle = '📌 Other Changes';
        if (match) {
          const type = match[1].toLowerCase();
          categoryTitle = CATEGORY_NAMES[type] || '📌 Other Changes';
        }

        if (!categoryMap.has(categoryTitle)) {
          categoryMap.set(categoryTitle, []);
        }
        categoryMap.get(categoryTitle)!.push({ hash, shortHash, message, author });
      }

      const categories: ChangelogCategory[] = [];
      const order = [
        '✨ Features',
        '🐛 Bug Fixes',
        '⚡ Performance Improvements',
        '♻️ Code Refactoring',
        '📝 Documentation',
        '💄 Styles',
        '✅ Tests',
        '📦 Build System',
        '👷 Continuous Integration',
        '🔧 Maintenance & Chores',
        '⏪ Reverts',
        '📌 Other Changes'
      ];

      for (const title of order) {
        if (categoryMap.has(title)) {
          categories.push({
            title,
            items: categoryMap.get(title)!
          });
        }
      }

      // Any remaining categories
      for (const [title, items] of categoryMap.entries()) {
        if (!order.includes(title)) {
          categories.push({ title, items });
        }
      }

      // Build markdown
      let markdown = `# Release Notes (${fromRef || 'Start'} → ${targetRef})\n\n`;
      for (const cat of categories) {
        markdown += `### ${cat.title}\n\n`;
        for (const item of cat.items) {
          markdown += `- **[\`${item.shortHash}\`]** ${item.message} *(@${item.author})*\n`;
        }
        markdown += '\n';
      }

      return {
        fromRef: fromRef || 'initial',
        toRef: targetRef,
        categories,
        totalCommits: lines.length,
        markdown
      };
    } catch {
      return null;
    }
  });
}
