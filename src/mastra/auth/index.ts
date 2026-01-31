import { MastraJwtAuth } from '@mastra/auth';

export const authConfig = new MastraJwtAuth({
  secret: process.env.MASTRA_JWT_SECRET,
});
