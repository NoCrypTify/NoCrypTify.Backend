import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://secretnotes:secretnotes@localhost:5432/secretnotes',
};
