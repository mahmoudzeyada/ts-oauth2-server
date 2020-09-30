import { OAuthClient } from "~/entities/client.entity";
import { GrantIdentifier } from "~/grants/abstract/grant.interface";

export interface OAuthClientRepository {
  getClientByIdentifier(clientId: string): Promise<OAuthClient>;

  isClientValid(grantType: GrantIdentifier, client: OAuthClient, clientSecret?: string): Promise<boolean>;
}
