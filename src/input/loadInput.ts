// Převádí soubory v data/ na ověřené vstupy pravidel; bez sítě a databáze.
// Chybějící klíče odpovídají null; nečitelný export nebo chybějící identita objednávky běh zastaví.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type {
  Complaint, DefinitionRule, Order, ReporterMatrixRow, Rules, WmsReturn,
} from "../domain/types.js";

export interface InputData {
  orders: Order[];
  complaints: Complaint[];
  returns: WmsReturn[];
  reporterMatrix: ReporterMatrixRow[];
  rules: Rules;
}

// Export má být pole záznamů; jiný kořen JSON nelze bezpečně zpracovat jako prázdnou sadu.
function readJsonArray(path: string): unknown[] {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(value)) throw new Error(`Soubor ${path} musí obsahovat pole.`);
  return value;
}

function readRecord(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${location}: záznam musí být objekt.`);
  }
  return value as Record<string, unknown>;
}

// Chybějící klíč a explicitní null mají stejný význam; jiný datový typ je chyba exportu.
function readNullableString(value: unknown, location: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${location}: hodnota musí být řetězec nebo null.`);
  }
  return value;
}

function readRequiredString(value: unknown, location: string): string {
  const text = readNullableString(value, location);
  if (text === null || text.trim() === "") {
    throw new Error(`${location}: hodnota musí být neprázdný řetězec.`);
  }
  return text;
}

// Objednávky přísně: bez orderId nelze sloučit duplicity, bez status nelze vybrat A/B.
// Každé pole se čte zvlášť, aby chybu typu doplnil název pole a číslo záznamu.
function readOrders(path: string): Order[] {
  const orders: Order[] = [];
  for (const [index, value] of readJsonArray(path).entries()) {
    const location = `orders.json, řádek ${index + 1}`;
    const row = readRecord(value, location);
    orders.push({
      orderId: readRequiredString(row.orderId, `${location}, orderId`),
      orderNumber: readNullableString(row.orderNumber, `${location}, orderNumber`),
      client: readNullableString(row.client, `${location}, client`),
      carrier: readNullableString(row.carrier, `${location}, carrier`),
      shippingMethod: readNullableString(row.shippingMethod, `${location}, shippingMethod`),
      trackingNumber: readNullableString(row.trackingNumber, `${location}, trackingNumber`),
      trackingUrl: readNullableString(row.trackingUrl, `${location}, trackingUrl`),
      status: readRequiredString(row.status, `${location}, status`),
      createdAt: readNullableString(row.createdAt, `${location}, createdAt`),
      packedAt: readNullableString(row.packedAt, `${location}, packedAt`),
      shippedAt: readNullableString(row.shippedAt, `${location}, shippedAt`),
      updatedAt: readNullableString(row.updatedAt, `${location}, updatedAt`),
    });
  }
  return orders;
}

// Reklamace tolerantně: chybějící kontakt je prázdný a výběr reportéra ho přeskočí.
// Chybějící orderNumber zůstane null a nemůže se spárovat s jinou objednávkou.
function readComplaints(path: string): Complaint[] {
  const complaints: Complaint[] = [];
  for (const [index, value] of readJsonArray(path).entries()) {
    const location = `complaints.json, řádek ${index + 1}`;
    const row = readRecord(value, location);
    complaints.push({
      complaintId: readNullableString(row.complaintId, `${location}, complaintId`) ?? "",
      orderNumber: readNullableString(row.orderNumber, `${location}, orderNumber`),
      client: readNullableString(row.client, `${location}, client`) ?? "",
      status: readNullableString(row.status, `${location}, status`) ?? "",
      reason: readNullableString(row.reason, `${location}, reason`) ?? "",
      reporter: readNullableString(row.reporter, `${location}, reporter`) ?? "",
      createdAt: readNullableString(row.createdAt, `${location}, createdAt`) ?? "",
    });
  }
  return complaints;
}

// U vratky je pro párování podstatné orderNumber; bez něj se záznam s objednávkou nespojí.
// Ostatní chybějící údaje zůstanou prázdné, aby se kvůli nim neztratil použitelný blokující záznam.
function readReturns(path: string): WmsReturn[] {
  const returns: WmsReturn[] = [];
  for (const [index, value] of readJsonArray(path).entries()) {
    const location = `returns.json, řádek ${index + 1}`;
    const row = readRecord(value, location);
    returns.push({
      returnId: readNullableString(row.returnId, `${location}, returnId`) ?? "",
      orderNumber: readNullableString(row.orderNumber, `${location}, orderNumber`),
      status: readNullableString(row.status, `${location}, status`) ?? "",
      createdAt: readNullableString(row.createdAt, `${location}, createdAt`) ?? "",
    });
  }
  return returns;
}

function readDefinition(value: unknown, name: string): DefinitionRule {
  if (typeof value !== "object" || value === null) {
    throw new Error(`V rules.yaml chybí definice ${name}.`);
  }
  const rule = value as Record<string, unknown>;
  if (typeof rule.name !== "string" || typeof rule.status !== "string" ||
      typeof rule.complaintReason !== "string" ||
      typeof rule.minDaysInStatus !== "number" || !Number.isFinite(rule.minDaysInStatus) ||
      !Array.isArray(rule.excludedShippingMethods) ||
      !rule.excludedShippingMethods.every((item: unknown) => typeof item === "string")) {
    throw new Error(`Definice ${name} v rules.yaml má neplatnou strukturu.`);
  }
  return {
    name: rule.name,
    status: rule.status,
    minDaysInStatus: rule.minDaysInStatus,
    complaintReason: rule.complaintReason,
    excludedShippingMethods: rule.excludedShippingMethods,
  };
}

// Obě definice se načítají z podkladů, hodnoty oken se zde neodhadují ani nepřepisují.
function readRules(path: string): Rules {
  const parsed: unknown = parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("definitions" in parsed)) {
    throw new Error("V rules.yaml chybí objekt definitions.");
  }
  const definitions = parsed.definitions;
  if (typeof definitions !== "object" || definitions === null) {
    throw new Error("V rules.yaml musí být definitions objekt.");
  }
  const values = definitions as Record<string, unknown>;
  return { A: readDefinition(values.A, "A"), B: readDefinition(values.B, "B") };
}

// reporters.csv má jednoduché dva sloupce bez uvozovek; e-mail čárku neobsahuje.
// Dělení podle první čárky zachovává tento smluvený formát, nejde o obecný CSV parser.
function readReporterMatrix(path: string): ReporterMatrixRow[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  if (lines[0]?.trim() !== "client,reporter_email") {
    throw new Error("Soubor reporters.csv má neplatnou hlavičku.");
  }
  const rows: ReporterMatrixRow[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === "") continue;
    const comma = line.indexOf(",");
    if (comma < 0) throw new Error("Řádek v reporters.csv neobsahuje čárku.");
    rows.push({ client: line.substring(0, comma).trim(), reporterEmail: line.substring(comma + 1).trim() });
  }
  return rows;
}

// Všechny zdroje se načtou před rozhodováním; chyba vstupu nesmí vytvořit částečný report.
export function loadInput(dataDir: string): InputData {
  return {
    orders: readOrders(join(dataDir, "orders.json")),
    complaints: readComplaints(join(dataDir, "complaints.json")),
    returns: readReturns(join(dataDir, "returns.json")),
    reporterMatrix: readReporterMatrix(join(dataDir, "reporters.csv")),
    rules: readRules(join(dataDir, "rules.yaml")),
  };
}
