export default {
  datasource: {
    url: process.env.DATABASE_URL || "file:./db/taskflow.db",
  },
}
