# Shelf-life (`base_shelf_days`) review

`base_shelf_days` is how many days *unripe*/freshly-harvested produce keeps at room
temperature (no refrigeration) in Thailand before it's no longer sellable. It drives
`predictShelfHours` (`server/src/domain/shelfLife.ts`) and the price decay curve
(`lotPricePerKg`, D048).

This review (2026-09) checked all 31 seeded crops against available postharvest
sources. Only durian had a source specific and clear enough to justify a change; the
rest are marked **needs verification** rather than guessed, per the rule of not
inventing citations. A follow-up pass with direct access to the FAO INPhO postharvest
compendium or DOA/PHTIC (Postharvest Technology Innovation Center, Kasetsart
University) Thai-language publications is needed to responsibly revise them.

| Crop (TH) | Crop (EN) | `base_shelf_days` | Status | Source |
|---|---|---|---|---|
| มะม่วง | Mango | 5 | needs verification | UC Davis/FAO fact sheets describe ripening behavior but no Thai-ambient day count confirmed |
| กล้วยน้ำว้า | Namwa banana | 4 | needs verification | — |
| มะเขือเทศ | Tomato | 6 | needs verification | — |
| ผักบุ้ง | Morning glory | 2 | needs verification | — |
| มะนาว | Lime | 14 | needs verification | — |
| ทุเรียน | Durian | **7** (was 3) | **verified** | [UC Davis Postharvest Research & Extension Center](https://postharvest.ucdavis.edu/produce-facts-sheets/durian): mature-unripe durian ripens in ~4-6 days at ambient temperature, plus a short ripe window before spoiling |
| ส้มโอ | Pomelo | 14 | needs verification | — |
| ลำไย | Longan | 5 | needs verification | — |
| เงาะ | Rambutan | 4 | needs verification | — |
| ฝรั่ง | Guava | 5 | needs verification | — |
| สับปะรด | Pineapple | 5 | needs verification | — |
| น้อยหน่า | Custard apple | 3 | needs verification | — |
| คะน้า | Chinese kale | 3 | needs verification | — |
| ผักกาดขาว | Napa cabbage | 7 | needs verification | — |
| ผักชี | Coriander (cilantro) | 3 | needs verification | — |
| ต้นหอม | Green onion | 4 | needs verification | — |
| แตงกวา | Cucumber | 5 | needs verification | — |
| พริก | Chili | 7 | needs verification | — |
| มะเขือยาว | Thai eggplant | 5 | needs verification | — |
| กะหล่ำปลี | Cabbage | 10 | needs verification | — |
| ข้าวโพด | Corn | 2 | needs verification | — |
| ถั่วฝักยาว | Long bean | 3 | needs verification | — |
| ฟักทอง | Pumpkin | 14 | needs verification | — |
| ตะไคร้ | Lemongrass | 7 | needs verification | — |
| ใบกะเพรา | Holy basil | 3 | needs verification | — |
| ขิง | Ginger | 14 | needs verification | — |
| มันเทศ | Sweet potato | 14 | needs verification | — |
| หอมแดง | Shallot | 21 | needs verification | — |
| กระเทียม | Garlic | 21 | needs verification | — |
| มังคุด | Mangosteen | 7 | needs verification | — |
| ลิ้นจี่ | Lychee | 5 | needs verification | — |

**30/31 unchanged.** General web search did not surface precise, citable
Thailand-specific day counts for these; the FAO postharvest compendium PDF was not
text-extractable in this pass. Values are left as they were (not proven wrong, just
unverified) with a `// needs verification` trailing comment in
`server/src/db/seedData.ts`.
