import * as duckdb from "@duckdb/duckdb-wasm";
import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

let dbInstancePromise: Promise<AsyncDuckDB> | null = null;
let connectionPromise: Promise<AsyncDuckDBConnection> | null = null;

async function instantiateDuckDB(): Promise<AsyncDuckDB> {
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  if (!bundle.mainWorker) {
    throw new Error("DuckDB worker bundle could not be resolved");
  }
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  return db;
}

export function getDuckDB(): Promise<AsyncDuckDB> {
  if (!dbInstancePromise) {
    dbInstancePromise = instantiateDuckDB();
  }
  return dbInstancePromise;
}

export async function getDuckDBConnection(): Promise<AsyncDuckDBConnection> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const db = await getDuckDB();
      return db.connect();
    })();
  }
  return connectionPromise;
}

export async function registerCsvAsTable(tableName: string, csv: string) {
  if (!csv || csv.trim().length === 0) {
    throw new Error(`Cannot register empty CSV for table "${tableName}"`);
  }

  const db = await getDuckDB();
  const connection = await getDuckDBConnection();
  const fileName = `${tableName}.csv`;

  try {
    await db.registerFileText(fileName, csv);
    await connection.query(`DROP TABLE IF EXISTS "${tableName}"`);
    await connection.query(`CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${fileName}', HEADER=TRUE)`);
  } catch (error) {
    console.error(`Failed to register CSV table "${tableName}":`, error);
    throw error;
  }
}

export async function runQuery(query: string) {
  const connection = await getDuckDBConnection();
  return connection.query(query);
}

export async function dropTable(tableName: string) {
  const connection = await getDuckDBConnection();
  await connection.query(`DROP TABLE IF EXISTS "${tableName}"`);
}
