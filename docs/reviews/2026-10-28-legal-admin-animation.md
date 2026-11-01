# Legal and administrator surface motion

Branch: feat/legal-admin-animation
Base: develop at 7da1bcf (PR #224)

## Change

Legal and administrator pages reuse the existing Owner/Staff surface effect: a nine-second gold border drift, cursor-following spotlight, 240 ms hover transitions and keyboard focus ring. Existing Owner/Staff selectors and timing remain supported. Pointer tracking uses event delegation, including asynchronously loaded cards, and skips touch input and reduced-motion users.

The Legal queue, selected-case banner, document and decision panels, and the primary fallback/preview cards opt into the shared effect. Administrator overview cards, filters, plan/account panels and table frames opt in. Alerts, status badges, nested rows and dialogs retain their existing presentation.

Scrollable administrator tables have an outer animated frame and an inner scrolling region. Legal decision panels retain desktop sticky positioning and use an inset outline to avoid clipping. Legal document cards preserve the existing modal stacking behavior with isolation:auto, allowing evidence dialogs to appear above the shell and adjacent panels. Selected subscription plans keep their green selection border and ring.

No API, authorization, database, approval or unlock behavior changes.

## Validation

- 140 tests passed across workspaceSurfaceMotion, adminComponent, adminSubscriptionComponent, adminPayments, adminReviewFixes, legalLiveComponent, legalApprovalReview, legalReadIntegration and legalEvidence.
- The new runtime tests exercise real AppShell pointer delegation for Owner, Staff, all six Legal stages and all four administrator tabs, late-added cards, keyboard focus, touch/reduced-motion guards and workspace isolation.
- ESLint passed for all modified JavaScript/JSX and the new test.
- Production build passed. The existing large-bundle warning remains.
- Visual checks used the in-app browser with actual components and temporary synthetic fixtures, without accessing or changing backend data. The temporary review harness was removed before commit.
- Desktop checks confirmed the shared nine-second animation on Legal and administrator cards, sticky Legal actions, independent table scrolling and the selected-plan border/ring.
- At a 390 x 844 viewport, Legal and administrator content did not introduce page-wide horizontal overflow; tables retained their own horizontal scrolling. The Legal evidence dialog covered the header, trapped focus, and returned focus to its trigger when closed.
- Chrome could not be visually inspected because the native automation tool reported its window minimized. These checks do not claim authenticated backend or Chrome end-to-end acceptance.
