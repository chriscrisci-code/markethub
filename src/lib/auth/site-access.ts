import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const DEFAULT_SITE_USERNAME = "admin";
export const DEFAULT_SITE_PASSWORD = "admin";

type SiteAccess = {
  username: string;
  password: string;
};

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export async function readSiteAccess(): Promise<SiteAccess> {
  const service = createServiceClient();
  if (!service) {
    return {
      username: DEFAULT_SITE_USERNAME,
      password: DEFAULT_SITE_PASSWORD,
    };
  }

  const { data, error } = await service
    .from("site_access")
    .select("username, password")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return {
      username: DEFAULT_SITE_USERNAME,
      password: DEFAULT_SITE_PASSWORD,
    };
  }

  return {
    username: String(data.username || DEFAULT_SITE_USERNAME),
    password: String(data.password || DEFAULT_SITE_PASSWORD),
  };
}

export function credentialsMatch(
  access: SiteAccess,
  username: string,
  password: string
) {
  return (
    safeEqual(access.username.trim().toLowerCase(), username.trim().toLowerCase()) &&
    safeEqual(access.password, password)
  );
}

export async function updateSiteAccess(username: string, password: string) {
  const service = createServiceClient();
  if (!service) {
    return {
      error: "Server is missing SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const trimmedUsername = username.trim();
  if (!trimmedUsername) {
    return { error: "Username is required." };
  }
  if (!password) {
    return { error: "Password is required." };
  }

  const { error } = await service.from("site_access").upsert({
    id: 1,
    username: trimmedUsername,
    password,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    const missing =
      error.code === "42P01" ||
      error.message.toLowerCase().includes("site_access");
    return {
      error: missing
        ? "Run supabase/migrations/20261008130000_site_access.sql in the Supabase SQL Editor, then save again."
        : error.message,
    };
  }

  return { error: null };
}

/** Open a Supabase session for the oldest account so existing items stay visible. */
export async function openOwnerSession() {
  const service = createServiceClient();
  if (!service) {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const { data: listed, error: listError } = await service.auth.admin.listUsers({
    perPage: 200,
  });
  if (listError) {
    return { error: listError.message };
  }

  const withEmail = listed.users.filter((user) => user.email);
  let owner = [...withEmail].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? "")
  )[0];

  if (!owner) {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: "admin@markethub.local",
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (createError || !created.user.email) {
      return { error: createError?.message ?? "Could not create the admin account." };
    }
    owner = created.user;
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: owner.email!,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return { error: linkError?.message ?? "Could not start a session." };
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyError) {
    return { error: verifyError.message };
  }

  return { error: null };
}
