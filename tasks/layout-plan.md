# Match the Excalidraw layout

## Design contract

The Excalidraw home screen is the visual reference, not just a feature list.

- Use one compact top navigation bar: Belgium, Today, Calendar, Places, Notes, Checklists, Share.
- Start directly on the home dashboard, including before a trip exists.
- Put the greeting and member summary above a green next-plan card and an amber departure card.
- Show cities in a horizontal route, followed by a compact shared-note and quick-add strip.
- Remove the sidebar, editorial hero, dark trip banner, decorative illustration and separate onboarding page.
- Use compact sans-serif typography, light green and amber surfaces, thin borders and restrained spacing.
- Stack the two main cards on phones and keep the route scrollable inside its own region when needed.

## Details and persistence

Trip details open inline from the dashboard. No trip, dates, owner name or scheduled activities are invented on first load. Saving the details uses the existing create-trip API; existing trips use the existing update command. Features that require a saved trip open the inline details editor until one exists.

Keep member access, owner recovery, invitation links, private-note filtering, persistence and conflict handling unchanged. Existing trip databases require no migration.

## Verification

- Build and all unit/API tests pass.
- First load shows the dashboard, not a form, and sends no create request.
- Inline creation and later edits save correctly; cancellation keeps the main page.
- Existing invitation, privacy, checklist and conflict workflows still pass.
- Browser geometry checks verify top navigation, paired cards and a horizontal route.
- Inspect empty and populated dashboard screenshots against the reference at desktop and phone sizes.
