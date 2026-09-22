async function migrate(): Promise<void> {
  console.log('No migrations to apply yet. Schema lands in Phase 1.');
}

migrate().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

export {};
