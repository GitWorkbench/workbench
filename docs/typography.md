# Typography settings

Open **Settings → Typography & Density** to adjust each area separately. Changes apply immediately and save on this device.

| Control | Affects | Range | Default |
| --- | --- | --- | --- |
| Interface text | Navigation, buttons, labels and general workspace text | 11–16px | 13px |
| Diff & code text | Diff content and line numbers, merge editor, code/patch previews and terminal content | 10–18px | 12px |
| Home text | Repository cards, recent repositories and Home actions | 11–18px | 13px |
| Guide text | Explore Git Workbench navigation, cards and instructions | 11–20px | 13px |

Headings and supporting labels keep their size hierarchy within the selected area. Branch labels and commit hashes can use the monospace family while retaining interface sizing; changing code size does not resize them. The interface font family is shared by interface, Home and guide text. Code & Monospace Font controls the monospace family, separately from text sizes.

Each size card includes an exact-size preview, presets, a slider and an individual Reset button. **Reset typography** restores font families, custom font names, all four sizes and graph row density. Themes, Git/provider configuration, commit profiles and other preferences are preserved.

Graph row density is a separate choice. Increasing text size does not enlarge panel widths, padding or icons. Long text can wrap or scroll as needed.

## Existing preferences

Existing interface/code sizes are retained within supported ranges. On the first upgrade, Home and guide sizes inherit the previously saved interface size to preserve their appearance. They are stored separately from then on. Invalid, fractional or out-of-range stored typography values are normalized before use; reset an individual control to return to its default.

## Implementation

- The document keeps its 13px root scale for `rem` layout dimensions. Interface text uses `--font-size-ui` and the Tailwind text-size tokens, separately from layout dimensions.
- Home and guide use `--font-size-home` and `--font-size-guide` through scoped content typography tokens.
- `font-mono` selects a font family only. Code sizing is opt-in through `code-surface` or the merge editor’s explicit code size. Code line heights are unitless, so larger code remains readable without overlapping lines.
- Font limits, defaults, migration and setters share one definition in the settings store. Typography values are validated on load, save and application to the document.

Reference: [Tailwind theme variables](https://tailwindcss.com/docs/theme).
