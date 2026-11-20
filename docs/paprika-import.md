# Paprika recipe imports

The Recipes tab imports `.paprikarecipes` exports from Paprika Settings → Export.
It does not connect to Paprika Cloud Sync, require Paprika credentials, or modify
the original recipes. The updated Beacon add-on server is required (a standalone
Vite frontend alone does not provide recipe storage).

Choose an export, review the new/updated/unchanged counts, then confirm. Paprika
UIDs identify recipes; changing a title does not create a duplicate. Reimporting
the same export is idempotent. Recipes omitted from an export remain in Beacon.
Removing a recipe in Beacon requires confirmation and does not remove it from
Paprika; importing that recipe again will restore it.

The library includes search, category filters, embedded cover photos, ingredients,
directions, descriptions, notes, nutrition, servings, times, and source links.
Ingredient checkboxes are temporary cooking aids and reset when leaving a recipe.
Recipe text is displayed as text, never executed as HTML. Only embedded JPEG,
PNG, or WebP photos are used; external image URLs are not fetched. Additional
Paprika photo galleries are not imported in this first version.

The existing Menu card can open an imported recipe when its meal entry's
`recipe_id` matches the Paprika UID. The recipe export does not import meal plans
or grocery lists. Editing recipes stays in Paprika; export again to update Beacon.

Data lives in `/data/recipes/library.json`, included with normal add-on data
backups. It is separate from browser localStorage and shared across clients.
Uploads are limited to 30 MB, 2,000 recipe entries, 8 MB per decompressed recipe,
and 100 MB of decompressed content per import. Invalid archives fail before
writing anything. Imports/removals are serialized and library replacement is
atomic. Routes use the same Home Assistant ingress access boundary as the
existing Beacon data API; do not expose the add-on's raw server publicly.

No personal recipe exports or images belong in the source repository. Tests use
synthetic recipes only.
