import 'dotenv/config';
import { app } from './app';
import { env } from './config/env';

app.listen(Number(env.PORT), () => {
  console.log(`Folio backend running on port ${env.PORT} [${env.NODE_ENV}]`);
});
