// 테스트 프로세스의 Prisma 클라이언트가 test.db를 사용하도록 강제(앱 import 이전).
process.env.DATABASE_URL = "file:./test.db";
