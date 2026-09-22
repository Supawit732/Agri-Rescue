async function seed(): Promise<void> {
  console.log('No seed data yet. Sample rows land in Phase 1.');
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

export {};
