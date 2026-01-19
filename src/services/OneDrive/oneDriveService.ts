import axios from "axios";
import { getAccessToken } from "../../infra/auth/graphAuth";
import { DriveItem } from "../../types/oneDrive";
import { oneDriveSemaphore } from "../../utils/concurrency";
import { withRetry } from "../../utils/retry";

type DriveChildrenResponse = {
  value: DriveItem[];
  "@odata.nextLink"?: string;
};

/**
 * Faz GET na Graph API com controle de concorrência e retry
 */
export async function graphGet<T = any>(path: string): Promise<T> {
  return oneDriveSemaphore.run(() =>
    withRetry(
      async () => {
        const token = await getAccessToken();
        const res = await axios.get<T>(`https://graph.microsoft.com/v1.0${path}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
      },
      {
        maxRetries: 2,
        baseDelayMs: 1000,
      }
    )
  );
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

