# Design System Strategy: The Cognitive Architect

## 1. Overview & Creative North Star
The North Star for this design system is **"The Cognitive Architect."** In the high-stakes world of strategic recruitment, the UI must function as a high-precision instrument—not just a database. We are moving away from the "standard SaaS" look of boxes-inside-boxes. Instead, we lean into a sophisticated, editorial layout that balances extreme information density with visual "breathing room."

This system breaks the template through **intentional asymmetry** and **chromatic depth**. By utilizing tiered surfaces and glassmorphism, we create an environment where AI-driven insights feel like they are floating on layers of intelligence. The aesthetic is "Compact Premium": every pixel is earned, and every interaction is weighted with purpose.

---

## 2. Color & Surface Theory
Our palette is rooted in the authority of deep blues, punctuated by the "electric intelligence" of emerald and tech-blue.

*   **Primary (`#00236f`) & Secondary (`#006591`):** These are our foundational anchors. Use `primary` for high-level navigation and `secondary` for interactive elements to guide the eye through the data.
*   **The "No-Line" Rule:** We explicitly prohibit 1px solid borders for sectioning. Boundaries are defined by background shifts. To separate a sidebar from a main feed, transition from `surface` (`#f8f9ff`) to `surface_container_low` (`#eff4ff`). 
*   **Surface Hierarchy & Nesting:** Treat the UI as a physical stack.
    *   **Base:** `surface` (`#f8f9ff`)
    *   **Sectioning:** `surface_container_low` (`#eff4ff`)
    *   **Interactive Cards:** `surface_container_lowest` (`#ffffff`)
*   **The "Glass & Gradient" Rule:** To signify AI-driven "Gemini-style" insights, use backdrop-blur (12px–20px) on `surface_container_highest` with 80% opacity. 
*   **Signature Textures:** Main Action Buttons should not be flat. Apply a subtle linear gradient from `primary` (`#00236f`) to `primary_container` (`#1e3a8a`) at a 135-degree angle to provide a "jeweled" depth that signifies premium functionality.

---

## 3. Typography: Editorial Precision
We utilize **Inter** to create a typographic scale that feels like a high-end financial journal.

*   **Display & Headlines:** Use `display-md` (2.75rem) for macro-stats (e.g., "98% Match"). This high-contrast scale creates an editorial "hero" moment amidst dense data.
*   **Titles:** `title-md` (1.125rem) should be used for card headers. It provides enough weight to anchor a section without occupying unnecessary vertical space.
*   **The "Data-Label" Strategy:** For the "Compact" requirement, we rely heavily on `label-md` and `label-sm`. Use these for metadata (e.g., "Candidate Experience," "Last Active") to maximize density while maintaining a professional, sharp look.
*   **Clarity over Decoration:** Never use italics for data. Use weight shifts (Medium to Semi-Bold) to denote hierarchy within the `body-md` scale.

---

## 4. Elevation & Depth
Depth in this system is achieved through **Tonal Layering** rather than structural lines.

*   **The Layering Principle:** Avoid shadows for static content. Instead, "stack" your tokens. A `surface_container_lowest` card sitting on a `surface_container_low` background creates a natural, soft lift that feels integrated into the OS.
*   **Ambient Shadows:** For floating elements (Modals, Popovers), shadows must be "Ambient." Use the `on_surface` color (`#0d1c2e`) at 6% opacity with a `24px` blur and `8px` Y-offset. This mimics natural light rather than a digital drop shadow.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline_variant` (`#c5c5d3`) at **20% opacity**. It should be felt, not seen.
*   **Glassmorphism:** AI insight panels should use a semi-transparent `tertiary_container` (`#004a31`) with a 15% opacity and a `backdrop-filter: blur(10px)`. This creates a "Smart Layer" effect.

---

## 5. Components

*   **Buttons:**
    *   **Primary:** Gradient from `primary` to `primary_container`. Roundedness: `md` (0.375rem).
    *   **Secondary:** `surface_container_high` with `on_secondary_container` text.
*   **Chips (AI Tags):** Use `tertiary_fixed_dim` (`#4edea3`) for positive AI correlations. Keep them compact using `label-sm` and `1.5` (0.3rem) vertical padding.
*   **Information Cards:** No borders. No dividers. Use `Spacing 4` (0.9rem) to separate internal content. For list items within cards, use a simple background hover state of `surface_variant` to indicate interactivity.
*   **Input Fields:** Ghost-style inputs. Use `surface_container_low` as the background with a `0.5px` ghost border of `outline_variant`. On focus, transition the background to `surface_container_lowest` and increase the ghost border opacity to 100%.
*   **Data Visualization:** Use `secondary` (`#006591`) for trends and `tertiary_fixed` (`#6ffbbe`) for AI "Success" indicators. The contrast between the deep blue and the vibrant emerald is the signature visual hook of the platform.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use `Spacing 1.5` and `2.5` for micro-adjustments in dense data tables to maintain a "compact" feel.
*   **Do** leverage `surface_bright` for tooltips to make them pop against deep blue headers.
*   **Do** use "Editorial White Space": large margins (Spacing 10 or 12) at the edges of the screen, but tight, dense spacing (Spacing 2 or 3) within data clusters.

### Don't:
*   **Don't** use 1px solid dividers (e.g., `<hr>`). Use a `1px` gap with a background color shift instead.
*   **Don't** use pure black for text. Always use `on_surface` (`#0d1c2e`) to maintain the sophisticated blue-tinted professional tone.
*   **Don't** use "Extra Large" rounding. Stick to `md` (0.375rem) or `lg` (0.5rem). Anything higher feels too "consumer-grade" and loses the strategic, professional edge.
*   **Don't** use standard blue for AI. AI is always represented by the "Tech-Emerald" `tertiary` tokens to differentiate machine logic from human-triggered actions.