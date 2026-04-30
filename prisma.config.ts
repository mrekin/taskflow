const config = {
  datasource: {
    url: process.env.DATABASE_URL || "file:./db/taskflow.db",
  },
}

export default config
