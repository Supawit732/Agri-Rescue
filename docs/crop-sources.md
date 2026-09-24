# Crop storage guidance sources (approximate)

Values in `crops.storage_tip_th` / `storage_tip_en`, `fridge_ok`, and `fridge_extra_days` are **approximations for demo/education**, not food-safety guarantees. Cross-checked against common Thai/EU produce guidance; dates relative to lot `expires_at`.

| Crop (key) | Fridge | Fridge extra days (past lot expiry) | Storage tip (summary) | Sources |
|---|---|---:|---|---|
| mango | yes | 2 | Room-ripe; refrigerate cut/leftover fruit 2–3 days; keep dry | [FDA Food Storage](https://www.fda.gov/consumers/food-safety-keeping-food-safe/keeping-food-safe-food-safe), [UF/IFAS mango storage](https://ifas.ufl.edu/produce/), NHS [Fruit and veg](https://www.nhs.uk/live-well/eat-and-drink/food-safety-and-hygiene/how-to-store-food/) |
| banana / namwa | yes | 3 | Room temp to ripen; fridge slows browning of peel ~1 week; separate from ethylene-sensitive produce | NHS fruit storage; [Banana ripening/storage](https://www.bananalink.org.uk/information/growing-bananas/) |
| tomato | yes | 4 | Stem-up at room until ripe; fridge only if fully ripe and cut | FDA; [Commodity-specific tomato storage](https://www.ars.usda.gov/) |
| morning glory (leafy) | yes | 2 | High humidity, use within 1–2 days; wash before use; discard yellow/mushy leaves | NHS; [Leafy greens storage (UC Davis)](https://postharvest.ucdavis.edu/) |
| lime | yes | 14 | Cool dry place; refrigerate for longer shelf; avoid moisture | FDA citrus; [Lime storage notes](https://www.fruitandvegetable.ucr.edu/) |

**Notes**
- `fridge_extra_days` is added **on top of** `expires_at` for “fridge by” display only — it does not change market `expires_at`.
- Price-drop hint for vendor/shop when hours left &lt; 12h is product policy (PLAN 6.9), not from these sources.
- User-facing strings live in i18n (`orderDetail.*`), not AI-generated at runtime.
