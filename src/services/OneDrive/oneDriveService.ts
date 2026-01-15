import axios from "axios";
import { getAccessToken } from "../../infra/auth/graphAuth";
import { DriveItem } from "../../types/oneDrive";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";


type DriveChildrenResponse = {
  value: DriveItem[];
  "@odata.nextLink"?: string;
};

export async function graphGet<T = any>(path: string): Promise<T> {
  const token = await getAccessToken();

  try {
    const res = await axios.get<T>(`https://graph.microsoft.com/v1.0${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data
  } catch (err: any) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.error?.message ?? err?.message ?? "Erro desconhecido no Graph";
    throw new Error(`Graph GET falhou (${status ?? "?"}): ${msg}`)
  }
}

export async function getSiteIdFromPersonalPath(hostname: string, personalPath: string): Promise<string> {
  const site = await graphGet<{ id: string }>(`/sites/${hostname}:${personalPath}`);
  if (!site?.id) throw new Error("Não consegui obter siteId do SharePoint.");
  return site.id;
}

export async function getDriveIdFromSite(siteId: string): Promise<string> {
  const drive = await graphGet<{ id: string }>(`/sites/${siteId}/drive`);
  if (!drive?.id) throw new Error("Não consegui obter driveId do site");
  return drive.id;
}

function safeEncodePath(p: string) {
  return p.split("/").map(encodeURIComponent).join("/");
}

/**
 * Obtém item (pasta ou arquivo) pelo caminho relativo ao root.
 */
export async function getItemByPath(driveId: string, itemPath: string): Promise<DriveItem> {
  const encoded = safeEncodePath(itemPath.replace(/^\/+/, ""));
  return graphGet<DriveItem>(`/drives/${driveId}/root:/${encoded}`);
}

export async function listChildrenByDrivePath(
  driveId: string,
  drivePath: string
): Promise<DriveChildrenResponse> {
  const encoded = safeEncodePath(drivePath.replace(/^\/+/, ""));
  return graphGet<DriveChildrenResponse>(`/drives/${driveId}/root:/${encoded}:/children`);
}

export async function listChildrenByItemId(
  driveId: string,
  folderItemId: string
): Promise<DriveItem[]> {

  const all: DriveItem[] = [];

  let page = await graphGet<DriveChildrenResponse>(
    `/drives/${driveId}/items/${folderItemId}/children?$select=id,name,eTag,cTag,size,lastModifiedDateTime,file,folder`
  )

  all.push(...page.value);

  while (page["@odata.nextLink"]) {
    const nextPath = page["@odata.nextLink"].replace("https://graph.microsoft.com/v1.0", "")
    page = await graphGet<DriveChildrenResponse>(nextPath);
    all.push(...page.value)
  }
  return all
}

export async function downloadItemToFile(params: {
  driveId: string;
  itemId: string;
  destPath: string;
}): Promise<void> {
  const { driveId, itemId, destPath } = params;

  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;

  const res = await axios.get(url, {
    responseType: "stream",
    headers: { Authorization: `Bearer ${token}` },
    maxRedirects: 5,
  })

  await fsp.mkdir(path.dirname(destPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const tmp = `${destPath}.tmp`;
    const w = fs.createWriteStream(tmp);
    res.data.pipe(w);

    w.on("finish", async () => {
      try {
        await fsp.rename(tmp, destPath);
        resolve();
      } catch (e) {
        reject(e);
      }
    });

    w.on("error", reject);
  })
}
