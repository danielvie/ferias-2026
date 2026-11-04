# Six trip-sharing prototypes

Run `task prototypes:run` from the repository root, then open http://localhost:4173.

These are throwaway HTML design studies, separate from the existing app. There is no backend, authentication, editing or persistence. Each numbered HTML file can also be opened directly in a browser, with `shared.css` and `shared.js` beside it.

| Prototype | URL | Main idea |
| --- | --- | --- |
| 1. Guia | [1.html](1.html) | Illustrated daily field guide. Day strip above a two-column itinerary. |
| 2. Atlas | [2.html](2.html) | Clickable schematic route with a day inspector. Not a navigation map. |
| 3. Embarque | [3.html](3.html) | Dark departure board and a paper boarding pass. |
| 4. Postais | [4.html](4.html) | Illustrated postcards, activity list and a group sticky note. |
| 5. Agora | [5.html](5.html) | One compact day view with a calendar picker. |
| 6. Semana | [6.html](6.html) | Seven-day overview with selected-day details below. |

Use the bottom switcher or left/right arrow keys to compare layouts. The selected day stays the same. Both values live in the URL, for example `index.html?variant=2&day=10`. Day controls, activities, place notes and trip notes work in every layout. Dialogs support Escape and native focus trapping.

## Content assumptions

Portuguese copy follows the source itinerary for Belgium and the Netherlands, December 2–15, 2026. Content was taken from the existing worktree's `data/itinerary-import/source.json`, without using its UI as a design reference.

The source's overview and detailed sections disagree on some dates. These prototypes follow the overview for Valkenburg, Helmond and Asten. Ghent and other unresolved plans remain visibly tentative. Activity times are illustrative, not confirmed reservations. Some unscheduled days include clearly marked suggestions.

All illustrations and icons are local inline SVGs. Google Fonts is optional; system fallbacks keep the pages usable offline. No photo or map service is required. Only the explicit map-search link opens an external service.

## Compare the designs

For each option, try finding the city on December 10, that day's activities, its place notes and the trip-wide notes. Repeat on a narrow screen. The question is which layout makes these tasks easiest, not which palette wins.

## Checks

With `task prototypes:run` active, run `task prototypes:check` and visit [check.html](check.html). The dependency-free browser check exercises all six layouts and all 14 days at 320, 768, 1024 and 1440 pixels. It checks horizontal overflow, activity details, notes, map/calendar selection and reload-stable URL state. It does not replace visual or assistive-technology review.

These files archive the first design round. The application integration lives in `src/features/roteiro/`; see [round 2](rodada-2/README.md) for the chosen direction. The prototypes do not require a build.
