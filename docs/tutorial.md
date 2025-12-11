# Next.js Procurement System Tutorial

Welcome to the tutorial for the Nib InternationalBank Procurement System. This document will walk you through the core concepts and architecture of this Next.js application.

## 1. Project Structure

The project uses a standard Next.js App Router structure. Here are the key directories:

-   **/prisma/**: Contains your database schema (`schema.prisma`) and the script to seed your database with initial data (`seed.ts`). This is the single source of truth for your database structure.

-   **/public/**: Stores static assets like images (`logo.png`) that are served directly.

-   **/src/app/**: The heart of the application, using the Next.js App Router.
    -   `/(app)`: A route group for all pages that are part of the main authenticated application experience. It contains its own `layout.tsx` which provides the sidebar and main app shell.
    -   `/api`: Contains all backend API logic. Each subdirectory maps to an API endpoint (e.g., `/api/requisitions` is handled by `src/app/api/requisitions/route.ts`).
    -   `/login` & `/register`: Publicly accessible pages for user authentication.
    -   `/vendor`: A separate area for the vendor-facing portal.
    -   `layout.tsx` & `page.tsx`: The root layout and entry point for your application.

-   **/src/components/**: Contains all React components.
    -   `/ui`: Core UI elements from **ShadCN UI** (Button, Card, Input, etc.).
    -   Application-specific components like `requisitions-table.tsx` or `dashboard.tsx` are at the top level.

-   **/src/contexts/**: Holds React Context providers, which manage global state like authentication (`auth-context.tsx`) and theme (`theme-context.tsx`).

-   **/src/lib/**: A collection of utility files, data definitions, and core logic.
    -   `auth.ts`: Functions for handling JSON Web Token (JWT) creation and verification.
    -   `prisma.ts`: Initializes and exports a singleton Prisma client for database access.
    -   `roles.ts`: Defines user roles and their associated navigation permissions.
    -   `types.ts`: Contains all TypeScript type definitions for data models (e.g., `PurchaseRequisition`, `User`).

-   **/src/services/**: For abstracting complex business logic away from API routes, such as the three-way matching algorithm.

## 2. Routing with the App Router

This app uses the Next.js App Router, where the filesystem defines the routes.

-   **`page.tsx`**: This file defines a publicly accessible page for a given route. For example, `src/app/login/page.tsx` creates the page at the URL `/login`.
-   **`layout.tsx`**: This file defines a shared UI shell for a set of pages. For example, `src/app/(app)/layout.tsx` wraps all authenticated pages with the main sidebar, header, and user avatar.
-   **Route Groups `(...)`**: The `(app)` folder is a "route group". It allows you to share a layout (`(app)/layout.tsx`) for a set of routes without adding `(app)` to the URL. So, `src/app/(app)/dashboard/page.tsx` is accessible at `/dashboard`.

## 3. Data Flow: From UI to Database

The application follows a classic full-stack pattern.

1.  **Client-Side (Component)**: A user interacts with a component (e.g., clicks "Save" on the `needs-recognition-form.tsx`).
2.  **API Call**: The component uses the `fetch` API to send a request to a Next.js API Route (e.g., `POST /api/requisitions`).
3.  **API Route (`route.ts`)**: The corresponding `route.ts` file receives the request. It uses the **Prisma Client** to perform database operations (Create, Read, Update, Delete).
4.  **Prisma Client**: Prisma translates the TypeScript code into SQL and interacts with the PostgreSQL database.
5.  **Response**: The API route sends a JSON response back to the client, which then updates the UI (e.g., shows a success toast, redirects the user).

**Example: Creating a Requisition**
-   The form in `needs-recognition-form.tsx` sends a `POST` request to `/api/requisitions`.
-   The `POST` function in `src/app/api/requisitions/route.ts` receives the form data.
-   It uses `prisma.purchaseRequisition.create(...)` to save the new requisition to the database.
-   It returns the newly created requisition as a JSON response.

## 4. Authentication and Authorization

-   **Authentication (JWT)**: When a user logs in via the `/login` page, the `/api/auth/login` endpoint verifies their credentials. If successful, it generates a **JSON Web Token (JWT)** and sends it to the client. This token is stored in the browser's `localStorage`.
-   **Authenticated Requests**: For every subsequent API request, the client includes this JWT in the `Authorization` header.
-   **Authorization (Server-Side)**: The API routes use a helper function (`getActorFromToken` in `src/lib/auth.ts`) to verify the JWT. This function checks the token's signature and ensures it's valid. The decoded token payload (containing user ID and roles) is then used to determine if the user is allowed to perform the requested action.
-   **State Management (`auth-context.tsx`)**: The `AuthProvider` is a global context that loads the user's data from `localStorage` on app start. It makes the `user`, `role`, and `token` available to all components, so the UI can adapt (e.g., show/hide sidebar items).

## 5. Styling with Tailwind and ShadCN

-   **Tailwind CSS**: A utility-first CSS framework used for all styling. Instead of writing CSS files, you apply classes directly in your JSX (e.g., `className="font-bold text-primary"`).
-   **ShadCN UI**: Not a component library, but a collection of reusable components (like `Button`, `Card`, `Dialog`) that you "own". They are located in `src/components/ui` and are built using Tailwind CSS, making them fully customizable.
-   **Theming**: The application's color scheme is defined using CSS variables in `src/app/globals.css`. This makes it easy to change primary colors, backgrounds, and implement dark mode.

## 6. AI Functionality with Genkit

The application is set up to use Genkit for generating AI-powered content.

-   **`src/ai/genkit.ts`**: This file initializes the Genkit AI instance, configuring it to use the Google AI provider (`gemini-2.5-flash` model).
-   **Flows (`src/ai/flows/`)**: A "flow" is a server-side function that orchestrates calls to an AI model. For example, the `rfq-generation.ts` file is where you would implement logic to take a requisition, create a prompt, and ask the AI to generate an RFQ document.
-   **Usage**: Components on the client-side would call an API route, which in turn would invoke the Genkit flow to get the AI-generated result.
