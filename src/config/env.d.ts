declare namespace NodeJS {
  interface ProcessEnv {
    PORT: string;
    NODE_ENV: 'development' | 'production' | 'test';
    ENDPOINT: string;
    SECRET: string;
    SECRET_ADMIN: string;
    ANNOUNCED_IP: string;
  }
}