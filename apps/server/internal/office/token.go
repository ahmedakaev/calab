package office

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// ---- the Document Server's JWT (api.onlyoffice.com «Signature») ----

// signConfig signs the editor configuration: the token's claims are the configuration itself
// (HS256), and the configuration gets it as "token".
func signConfig(secret []byte, cfg map[string]any) (string, error) {
	claims := jwt.MapClaims{}
	for k, v := range cfg {
		if k != "token" {
			claims[k] = v
		}
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// parseDS verifies a token the Document Server signed and returns its claims.
func parseDS(secret []byte, tok string) (jwt.MapClaims, error) {
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(tok, claims, func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}
	return claims, nil
}

// bearer is the token of an "Authorization: Bearer …" header ("" without one).
func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

// errOperation: a Document Server token for another request (10.0+ «operation»).
var errOperation = errors.New("office: token operation mismatch")

// checkOperation accepts a token without "operation" (Document Server before 10.0) or with op.
func checkOperation(claims jwt.MapClaims, op string) error {
	if v, ok := claims["operation"]; ok && v != op {
		return errOperation
	}
	return nil
}

// ---- our URL tokens (file and callback URLs) ----

const (
	opFile     = "file"
	opCallback = "callback"
)

type urlClaims struct {
	Op   string `json:"op"`
	File string `json:"fid,omitempty"`
	jwt.RegisteredClaims
}

// signURL issues the token of a file URL (exp set, pinned to fileID) or a callback URL (no exp:
// a session may stay open for days; the Document Server's own JWT authenticates the callback).
func signURL(key []byte, op string, item, fileID uuid.UUID, exp time.Time) (string, error) {
	c := urlClaims{Op: op, RegisteredClaims: jwt.RegisteredClaims{Subject: item.String(), Audience: jwt.ClaimStrings{"office"}}}
	if fileID != uuid.Nil {
		c.File = fileID.String()
	}
	if !exp.IsZero() {
		c.ExpiresAt = jwt.NewNumericDate(exp)
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(key)
}

// parseURL verifies a URL token of operation op at now: the item and the pinned file.
func parseURL(key []byte, op, tok string, now time.Time) (item, fileID uuid.UUID, err error) {
	var c urlClaims
	_, err = jwt.ParseWithClaims(tok, &c, func(*jwt.Token) (any, error) { return key, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithAudience("office"),
		jwt.WithTimeFunc(func() time.Time { return now }))
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	if c.Op != op {
		return uuid.Nil, uuid.Nil, fmt.Errorf("office: url token for %q", c.Op)
	}
	if op == opFile && c.ExpiresAt == nil {
		return uuid.Nil, uuid.Nil, errors.New("office: file url token without exp")
	}
	if item, err = uuid.Parse(c.Subject); err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	if c.File != "" {
		if fileID, err = uuid.Parse(c.File); err != nil {
			return uuid.Nil, uuid.Nil, err
		}
	}
	return item, fileID, nil
}

// DeriveURLKey derives the URL token key from the API's JWT_SECRET (a separate key: a leaked
// URL token never verifies as a session token and back).
func DeriveURLKey(apiSecret []byte) []byte {
	m := hmac.New(sha256.New, apiSecret)
	m.Write([]byte("calab-office-url-v1"))
	return m.Sum(nil)
}

// sessionKey is the document.key of a session that starts on fileID: deterministic, so two
// members opening the item at once get the same key even before Join settles; 0-9a-f and «-»
// only, 46 characters (the Document Server allows [0-9a-zA-Z.=_-], up to 128). Keyed with the
// URL key: keys are unique per installation on a shared Document Server.
func sessionKey(urlKey []byte, item, fileID uuid.UUID) string {
	m := hmac.New(sha256.New, urlKey)
	m.Write(item[:])
	m.Write(fileID[:])
	return "calab-" + hex.EncodeToString(m.Sum(nil)[:20])
}
