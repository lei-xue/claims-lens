# Claims Lens — four workbench concepts

## 1. Mode and normalized brief
**Mode: design.** Create four distinct, polished whole-page desktop PNG concepts for a US physician-practice denial-management workbench. Audience: billers, RCM managers, and hiring reviewers. Target viewport approximately 1440×900. Preserve one common fictional dataset and show horizontal product navigation, four KPIs, five filters, eight worklist rows, and the selected claim's header, three-line 837/835 reconciliation, plain-English denial guidance, four actions, and activity timeline.

Visual requirements established before generation: dense readable tables; right-aligned monetary columns; explicit status and age labels; a visible selected-row relationship to the detail pane; restrained professional palettes; materially different typography/surface treatments. Exclude the specified beige/sage/italic-serif, navy-sidebar, offset-black-shadow/yellow, pharmacy-amber, and purple-gradient styles.

## 2. Evidence inventory
- User brief: authoritative requirements; no attached images or named source-image references.
- Repository README.md: existing project interprets 837P and 835, explains denials, and uses fictional data. Context only; no claim of inspecting the live app.
- Direct pixel inspection: all four generated PNGs via view_image, including complete page edges, rows, reconciliation, actions, and timeline.
- File validation: all four decode as RGB PNG, **1586×992**. Originals retained; copies saved here.
- Built-in image_gen tool only, four separate concept prompts. Exact common prompt and direction additions retained in generation-prompts.txt. No CLI/API-key fallback, source-image overwrite, or implementation changes.

## 3. Executive verdict
**Recommend Ledger** as the primary direction: connected KPI ribbon, disciplined table rules, monospace financial data, and a clear red selection/action hierarchy make the accounting task prominent. **Clearspace** is the strongest alternative for a calmer general-purpose workspace. Nightshift provides a convincing dark operations direction; Casefile provides the most distinctive document-review grammar.

These are reviewable design candidates, not approved production specifications. All four visibly cover the requested screen sections and contain eight complete rows without obvious clipping. Their layouts remain similar to preserve comparability, while their palette, type treatment, surface organization, and section hierarchy differ.

## 4. Concept matrix
Typeface names describe intended implementation choices; generated pixels cannot establish exact font identity. Hex values are prompt targets, not sampled measurements.

| Concept — one-line premise | Palette | Type choices | Hypothesis and tradeoff |
|---|---|---|---|
| **01 Ledger — a precise financial register for fast denial triage.** | Cool white/zinc, graphite, vermilion (#C64B36) | IBM Plex Sans-style UI; Plex Mono-style IDs/money | Tight alignment supports scanning. More austere, and widespread monospace makes labels feel technical. |
| **02 Clearspace — a calm light workspace with obvious section hierarchy.** | White/cool gray, charcoal, petrol teal (#087F82), restrained coral | Source Sans 3-style humanist sans; large semibold headings | Clear grouped panels lower visual pressure. Icons, rounded cards and multicolor chips add ornament and can feel conventional. |
| **03 Nightshift — a dark operations console for continuous queue monitoring.** | Charcoal/gunmetal, off-white, mint (#73D8C4), coral alerts | Inter-style sans; JetBrains Mono-style IDs/CPT/money | Mint selection and bright values stand out on dark surfaces. Muted text/rules require careful contrast validation. |
| **04 Casefile — a remittance dossier with numbered review sections.** | White/steel gray, slate, oxblood (#853E51) | Upright Roboto Slab-style headings/KPIs; Source Sans 3-style body | Numbered sections make claim review deliberate. Heavy serif headings occupy more attention and width. |

## 5. Detailed findings with observed evidence

### Shared evidence
All comps show $48,210 open denials / 132 claims, $21,940 recovered, 11.4 average days, and 9.8% denial rate. The selected Maya Bennett claim is MGFM20260403, Northwind Health Plan, DOS Apr 03, 2026. Reconciliation visibly includes 99214 / $180.00, 20610-RT / $200.00, and J1030 / $40.00, with $0.00 allowed/paid and CO-197 on each line; total billed is $420.00. Money is aligned in columns. All five denial categories and all five requested status labels appear in the worklist. All four action labels and all four timeline events are visible.

Ledger uses thin continuous rules and a vermilion selected-row edge matching its primary action. Clearspace separates reconciliation, guidance and activity into rounded white cards; its worklist selected row is pale teal. Nightshift uses a mint outline around the selected row and a mint primary button against dark panels. Casefile uses an oxblood row marker and primary action, upright serif headings, and 01/02/03 detail-section markers.

### Issues and corrections before implementation
| Severity | Visible evidence / inference | Impact | Concrete fix |
|---|---|---|---|
| Medium | Every comp says “Sorted by oldest first,” but the initial ages are 38d, 46d, 42d. Casefile additionally shows a downward age-sort arrow. | The sort promise contradicts the data. | Order rows 46, 42, 38, 31, 28, 22, 18, 12 days, keeping Maya selected in row three; or remove the sort assertion. |
| Medium | “Likely cause” states that the authorization number was missing; the screenshots show a denial code but no underlying authorization evidence. | A hypothesis may be read as a verified finding. | Say “Authorization may be missing or invalid; check the submitted claim and payer record.” |
| Medium | Many unrelated chip and avatar colors appear, particularly in Clearspace and Casefile. | Competing visual signals can obscure aging and workflow priority. | Reserve semantic color for age/status; use neutral denial-code chips and mostly neutral owner avatars. |
| Medium | Nightshift secondary copy, borders and disabled pagination are visually muted. No measured contrast audit was performed. | Small text may be harder to read at target size. | Verify actual tokens at WCAG contrast thresholds and brighten secondary text as needed. |
| Low | Clearspace's reconciliation summary is italic; Casefile has dense, heavy heading treatment. | Small departures from their intended typographic systems. | Use upright tabular summary text; reduce dossier-heading weight if it competes with the financial result. |
| Low | Native files are 1586×992 rather than exact 1440×900. | An exact-viewport screenshot comparison requires scaling. | Compare at a common display width; build the chosen direction at 1440×900 and verify actual text sizes. |

No blocker was observed in these static concept images. That is a visual finding, not a production readiness certification.

## 6. Uncertainty and comparability limits
The candidates share content, selected claim, row count, native dimensions and broadly equivalent pane proportions, so visual comparison is fair. Minor text wrapping and wording compression differ; Nightshift and Casefile abbreviate the next-step sentence while retaining its meaning. All show the same timeline and note.

Exact typefaces, interactive behavior, responsive layouts, keyboard access, focus states, screen-reader semantics, and token-level contrast cannot be inferred from generated pixels. The “Likely cause” is fictional example copy, not a verified clinical or billing conclusion. No user research or real-company brand fit was established. Raster text is not a copy source for implementation. No comparison board was generated because four same-size full-page files already support side-by-side review.

## 7. Recommendation and next actions
Select Ledger for the strongest finance-first workbench, or Clearspace if a softer light workspace is preferred. A useful hybrid would retain Ledger's numeric alignment and restrained KPI ribbon with Clearspace's clearer grouping of right-panel sections.

Before promoting a direction, correct sort consistency, qualify the authorization hypothesis, simplify semantic color, and review actual type sizes and contrast in a coded 1440×900 screen. Selection of a concept should not approve every generated detail. These candidates remain in codex-visual; nothing was promoted to uiux.

## 8. Artifact manifest
All artifacts are inside **/root/projects/claims-lens/design/codex-visual/20261011-173210Z**:
- 01-ledger.png — complete financial-ledger comp; 1586×992 RGB PNG.
- 02-clearspace.png — complete calm-light comp; 1586×992 RGB PNG.
- 03-nightshift.png — complete dark-operations comp; 1586×992 RGB PNG.
- 04-casefile.png — complete document-dossier comp; 1586×992 RGB PNG.
- generation-prompts.txt — exact common generation prompt plus four direction additions.
- codex-report.md — this evidence report.

Chosen mode: design.

