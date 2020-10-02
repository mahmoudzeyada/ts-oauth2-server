import { OAuthToken } from "~/entities/token.entity";
import { OAuthException } from "~/exceptions/oauth.exception";
import { AbstractGrant } from "~/grants/abstract/abstract.grant";
import { RequestInterface } from "~/requests/request";
import { ResponseInterface } from "~/responses/response";
import { DateInterval } from "~/utils/date_interval";

export class RefreshTokenGrant extends AbstractGrant {
  readonly identifier = "refresh_token";

  async respondToAccessTokenRequest(
    request: RequestInterface,
    response: ResponseInterface,
    accessTokenTTL: DateInterval,
  ): Promise<ResponseInterface> {
    const client = await this.validateClient(request);

    const oldToken = await this.validateOldRefreshToken(request, client.id);

    const user = oldToken.user;

    const scopes = await this.validateScopes(this.getRequestParameter("scope", request, oldToken.scopes));

    scopes.forEach(scope => {
      if (!oldToken.scopes.map(scope => scope.name).includes(scope.name)) {
        throw OAuthException.invalidScope(scope.name);
      }
    });

    await this.tokenRepository.revoke(oldToken);

    const newToken = await this.issueAccessToken(accessTokenTTL, client, user, scopes);

    const [refreshToken, refreshTokenExpiresAt] = await this.issueRefreshToken();

    newToken.refreshToken = refreshToken;

    newToken.refreshTokenExpiresAt = refreshTokenExpiresAt;

    return await this.makeBearerTokenResponse(client, newToken, scopes);
  }

  private async validateOldRefreshToken(request: RequestInterface, clientId: string): Promise<OAuthToken> {
    const encryptedRefreshToken = this.getRequestParameter("refresh_token", request);

    if (!encryptedRefreshToken) {
      throw OAuthException.invalidRequest("refresh_token");
    }

    let refreshTokenData: any;

    try {
      refreshTokenData = await this.decrypt(encryptedRefreshToken);
    } catch (e) {
      if (e.message === "invalid signature") {
        throw OAuthException.invalidRequest("refresh_token", "Cannot verify the refresh token");
      }
      throw OAuthException.invalidRequest("refresh_token", "Cannot decrypt the refresh token");
    }

    if (!refreshTokenData?.refresh_token_id) {
      throw OAuthException.invalidRequest("refresh_token", "Token missing");
    }

    if (refreshTokenData?.client_id !== clientId) {
      throw OAuthException.invalidRequest("refresh_token", "Token is not linked to client");
    }

    if (Date.now() / 1000 > refreshTokenData?.expire_time) {
      throw OAuthException.invalidRequest("refresh_token", "Token has expired");
    }

    const refreshToken = await this.tokenRepository.getByRefreshToken(refreshTokenData.refresh_token_id);

    if (await this.tokenRepository.isRefreshTokenRevoked(refreshToken)) {
      throw OAuthException.invalidRequest("refresh_token", "Token has been revoked");
    }

    return refreshToken;
  }
}
