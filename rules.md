# Backend Refactor Rules (Strict)

You are refactoring an existing **Node.js + Express + Prisma backend**.

## Core Rules

1. **Do NOT change functionality**

   - No new logic
   - No behavior changes
   - Do not change response structure

2. **Always use JWT context**

   - organization_id → `req.user.organization_id`
   - user_id → `req.user.user_id`
   - Never read these from body or query.

3. **Follow REST endpoint naming**
   Replace RPC-style endpoints with resource endpoints.

4. **All routes are protected**
   `router.use(requireAccessToken)`

5. **Use Winston logger**
   Replace `console.log` / `console.error` with `logger.info / warn / error`.

6. **Always enforce organization ownership**
   Every Prisma query must scope by organization.

7. **Only safe optimizations allowed**

   - remove unnecessary queries
   - use relational Prisma filters
   - use `select` when possible
   - never change response shape

8. **Every response must include**

   - Updated Route
   - Updated Controller
   - Migration Guide (Markdown)

9. **Migration guides must be minimal Markdown**

Format:

## Old

METHOD /endpoint
params / query

## New

METHOD /endpoint
params / query

Notes

- key changes

10. **Do not invent schema fields**
    Only use fields that exist in the Prisma schema.
