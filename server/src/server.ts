import 'dotenv/config';
import { createApp } from './app';
import { startDitBackgroundWarm } from './jobs/ditPipeline';
import { startExpireSchedule } from './jobs/expireLots';

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

app.listen(port, '0.0.0.0', () => {
  console.log(`Agri-Rescue API listening on 0.0.0.0:${port}`);
});

startDitBackgroundWarm();
startExpireSchedule();
