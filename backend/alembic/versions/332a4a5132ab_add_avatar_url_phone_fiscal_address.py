"""add_avatar_url_phone_fiscal_address

Revision ID: 332a4a5132ab
Revises: 994c7afd724e
Create Date: 2026-05-24 17:41:17.085130

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '332a4a5132ab'
down_revision: Union[str, Sequence[str], None] = '994c7afd724e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone VARCHAR")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS fiscal_address VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS avatar_url")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS fiscal_address")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS phone")
    op.create_index(op.f('buckets_analytics_unique_name_idx'), 'buckets_analytics', ['name'], unique=True, schema='storage', postgresql_where='(deleted_at IS NULL)')
    op.create_table('oauth_client_states',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('provider_type', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('code_verifier', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('oauth_client_states_pkey')),
    schema='auth',
    comment='Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.'
    )
    op.create_index(op.f('idx_oauth_client_states_created_at'), 'oauth_client_states', ['created_at'], unique=False, schema='auth')
    op.create_table('mfa_amr_claims',
    sa.Column('session_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
    sa.Column('authentication_method', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['auth.sessions.id'], name=op.f('mfa_amr_claims_session_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('amr_id_pk')),
    sa.UniqueConstraint('session_id', 'authentication_method', name=op.f('mfa_amr_claims_session_id_authentication_method_pkey')),
    schema='auth',
    comment='auth: stores authenticator method reference claims for multi factor authentication'
    )
    op.create_table('buckets_vectors',
    sa.Column('id', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('type', postgresql.ENUM('STANDARD', 'ANALYTICS', 'VECTOR', name='buckettype', schema='storage'), server_default=sa.text("'VECTOR'::storage.buckettype"), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('buckets_vectors_pkey')),
    schema='storage'
    )
    op.create_table('sso_providers',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('resource_id', sa.TEXT(), autoincrement=False, nullable=True, comment='Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.'),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('disabled', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.CheckConstraint('resource_id = NULL::text OR char_length(resource_id) > 0', name=op.f('resource_id not empty')),
    sa.PrimaryKeyConstraint('id', name=op.f('sso_providers_pkey')),
    schema='auth',
    comment='Auth: Manages SSO identity provider information; see saml_providers for SAML.'
    )
    op.create_index(op.f('sso_providers_resource_id_pattern_idx'), 'sso_providers', ['resource_id'], unique=False, schema='auth')
    op.create_index(op.f('sso_providers_resource_id_idx'), 'sso_providers', [sa.literal_column('lower(resource_id)')], unique=True, schema='auth')
    op.create_table('saml_providers',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('sso_provider_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('entity_id', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('metadata_xml', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('metadata_url', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('attribute_mapping', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('name_id_format', sa.TEXT(), autoincrement=False, nullable=True),
    sa.CheckConstraint('char_length(entity_id) > 0', name=op.f('entity_id not empty')),
    sa.CheckConstraint('char_length(metadata_xml) > 0', name=op.f('metadata_xml not empty')),
    sa.CheckConstraint('metadata_url = NULL::text OR char_length(metadata_url) > 0', name=op.f('metadata_url not empty')),
    sa.ForeignKeyConstraint(['sso_provider_id'], ['auth.sso_providers.id'], name=op.f('saml_providers_sso_provider_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('saml_providers_pkey')),
    sa.UniqueConstraint('entity_id', name=op.f('saml_providers_entity_id_key')),
    schema='auth',
    comment='Auth: Manages SAML Identity Provider connections.'
    )
    op.create_index(op.f('saml_providers_sso_provider_id_idx'), 'saml_providers', ['sso_provider_id'], unique=False, schema='auth')
    op.create_table('refresh_tokens',
    sa.Column('instance_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('id', sa.BIGINT(), autoincrement=True, nullable=False),
    sa.Column('token', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('user_id', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('revoked', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('parent', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('session_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['session_id'], ['auth.sessions.id'], name=op.f('refresh_tokens_session_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('refresh_tokens_pkey')),
    sa.UniqueConstraint('token', name=op.f('refresh_tokens_token_unique')),
    schema='auth',
    comment='Auth: Store of tokens used to refresh JWT tokens once they expire.'
    )
    op.create_index(op.f('refresh_tokens_updated_at_idx'), 'refresh_tokens', [sa.literal_column('updated_at DESC')], unique=False, schema='auth')
    op.create_index(op.f('refresh_tokens_session_id_revoked_idx'), 'refresh_tokens', ['session_id', 'revoked'], unique=False, schema='auth')
    op.create_index(op.f('refresh_tokens_parent_idx'), 'refresh_tokens', ['parent'], unique=False, schema='auth')
    op.create_index(op.f('refresh_tokens_instance_id_user_id_idx'), 'refresh_tokens', ['instance_id', 'user_id'], unique=False, schema='auth')
    op.create_index(op.f('refresh_tokens_instance_id_idx'), 'refresh_tokens', ['instance_id'], unique=False, schema='auth')
    op.create_table('oauth_authorizations',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('authorization_id', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('client_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('user_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('redirect_uri', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('scope', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('state', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('resource', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('code_challenge', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('code_challenge_method', postgresql.ENUM('s256', 'plain', name='code_challenge_method', schema='auth'), autoincrement=False, nullable=True),
    sa.Column('response_type', postgresql.ENUM('code', name='oauth_response_type', schema='auth'), server_default=sa.text("'code'::auth.oauth_response_type"), autoincrement=False, nullable=False),
    sa.Column('status', postgresql.ENUM('pending', 'approved', 'denied', 'expired', name='oauth_authorization_status', schema='auth'), server_default=sa.text("'pending'::auth.oauth_authorization_status"), autoincrement=False, nullable=False),
    sa.Column('authorization_code', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('expires_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text("(now() + '00:03:00'::interval)"), autoincrement=False, nullable=False),
    sa.Column('approved_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('nonce', sa.TEXT(), autoincrement=False, nullable=True),
    sa.CheckConstraint('char_length(authorization_code) <= 255', name=op.f('oauth_authorizations_authorization_code_length')),
    sa.CheckConstraint('char_length(code_challenge) <= 128', name=op.f('oauth_authorizations_code_challenge_length')),
    sa.CheckConstraint('char_length(nonce) <= 255', name=op.f('oauth_authorizations_nonce_length')),
    sa.CheckConstraint('char_length(redirect_uri) <= 2048', name=op.f('oauth_authorizations_redirect_uri_length')),
    sa.CheckConstraint('char_length(resource) <= 2048', name=op.f('oauth_authorizations_resource_length')),
    sa.CheckConstraint('char_length(scope) <= 4096', name=op.f('oauth_authorizations_scope_length')),
    sa.CheckConstraint('char_length(state) <= 4096', name=op.f('oauth_authorizations_state_length')),
    sa.CheckConstraint('expires_at > created_at', name=op.f('oauth_authorizations_expires_at_future')),
    sa.ForeignKeyConstraint(['client_id'], ['auth.oauth_clients.id'], name=op.f('oauth_authorizations_client_id_fkey'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['auth.users.id'], name=op.f('oauth_authorizations_user_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('oauth_authorizations_pkey')),
    sa.UniqueConstraint('authorization_code', name=op.f('oauth_authorizations_authorization_code_key')),
    sa.UniqueConstraint('authorization_id', name=op.f('oauth_authorizations_authorization_id_key')),
    schema='auth'
    )
    op.create_index(op.f('oauth_auth_pending_exp_idx'), 'oauth_authorizations', ['expires_at'], unique=False, schema='auth', postgresql_where="(status = 'pending'::auth.oauth_authorization_status)")
    op.create_table('s3_multipart_uploads_parts',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('upload_id', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('size', sa.BIGINT(), server_default=sa.text('0'), autoincrement=False, nullable=False),
    sa.Column('part_number', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('bucket_id', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('key', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('etag', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('owner_id', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('version', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['bucket_id'], ['storage.buckets.id'], name=op.f('s3_multipart_uploads_parts_bucket_id_fkey')),
    sa.ForeignKeyConstraint(['upload_id'], ['storage.s3_multipart_uploads.id'], name=op.f('s3_multipart_uploads_parts_upload_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('s3_multipart_uploads_parts_pkey')),
    schema='storage'
    )
    op.create_table('instances',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('uuid', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('raw_base_config', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('instances_pkey')),
    schema='auth',
    comment='Auth: Manages users across multiple sites.'
    )
    op.create_table('audit_log_entries',
    sa.Column('instance_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('payload', postgresql.JSON(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('ip_address', sa.VARCHAR(length=64), server_default=sa.text("''::character varying"), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('audit_log_entries_pkey')),
    schema='auth',
    comment='Auth: Audit trail for user actions.'
    )
    op.create_index(op.f('audit_logs_instance_id_idx'), 'audit_log_entries', ['instance_id'], unique=False, schema='auth')
    op.create_table('saml_relay_states',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('sso_provider_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('request_id', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('for_email', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('redirect_to', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('flow_state_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.CheckConstraint('char_length(request_id) > 0', name=op.f('request_id not empty')),
    sa.ForeignKeyConstraint(['flow_state_id'], ['auth.flow_state.id'], name=op.f('saml_relay_states_flow_state_id_fkey'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['sso_provider_id'], ['auth.sso_providers.id'], name=op.f('saml_relay_states_sso_provider_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('saml_relay_states_pkey')),
    schema='auth',
    comment='Auth: Contains SAML Relay State information for each Service Provider initiated login.'
    )
    op.create_index(op.f('saml_relay_states_sso_provider_id_idx'), 'saml_relay_states', ['sso_provider_id'], unique=False, schema='auth')
    op.create_index(op.f('saml_relay_states_for_email_idx'), 'saml_relay_states', ['for_email'], unique=False, schema='auth')
    op.create_index(op.f('saml_relay_states_created_at_idx'), 'saml_relay_states', [sa.literal_column('created_at DESC')], unique=False, schema='auth')
    op.create_table('flow_state',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('user_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('auth_code', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('code_challenge_method', postgresql.ENUM('s256', 'plain', name='code_challenge_method', schema='auth'), autoincrement=False, nullable=True),
    sa.Column('code_challenge', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('provider_type', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('provider_access_token', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('provider_refresh_token', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('authentication_method', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('auth_code_issued_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('invite_token', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('referrer', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('oauth_client_state_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('linking_target_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('email_optional', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('flow_state_pkey')),
    schema='auth',
    comment='Stores metadata for all OAuth/SSO login flows'
    )
    op.create_index(op.f('idx_user_id_auth_method'), 'flow_state', ['user_id', 'authentication_method'], unique=False, schema='auth')
    op.create_index(op.f('idx_auth_code'), 'flow_state', ['auth_code'], unique=False, schema='auth')
    op.create_index(op.f('flow_state_created_at_idx'), 'flow_state', [sa.literal_column('created_at DESC')], unique=False, schema='auth')
    op.create_table('schema_migrations',
    sa.Column('version', sa.BIGINT(), autoincrement=False, nullable=False),
    sa.Column('inserted_at', postgresql.TIMESTAMP(precision=0), autoincrement=False, nullable=True),
    sa.PrimaryKeyConstraint('version', name=op.f('schema_migrations_pkey')),
    schema='realtime'
    )
    op.create_table('sessions',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('user_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('factor_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('aal', postgresql.ENUM('aal1', 'aal2', 'aal3', name='aal_level', schema='auth'), autoincrement=False, nullable=True),
    sa.Column('not_after', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.'),
    sa.Column('refreshed_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.Column('user_agent', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('ip', postgresql.INET(), autoincrement=False, nullable=True),
    sa.Column('tag', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('oauth_client_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('refresh_token_hmac_key', sa.TEXT(), autoincrement=False, nullable=True, comment='Holds a HMAC-SHA256 key used to sign refresh tokens for this session.'),
    sa.Column('refresh_token_counter', sa.BIGINT(), autoincrement=False, nullable=True, comment='Holds the ID (counter) of the last issued refresh token.'),
    sa.Column('scopes', sa.TEXT(), autoincrement=False, nullable=True),
    sa.CheckConstraint('char_length(scopes) <= 4096', name=op.f('sessions_scopes_length')),
    sa.ForeignKeyConstraint(['oauth_client_id'], ['auth.oauth_clients.id'], name=op.f('sessions_oauth_client_id_fkey'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['auth.users.id'], name=op.f('sessions_user_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('sessions_pkey')),
    schema='auth',
    comment='Auth: Stores session data associated to a user.'
    )
    op.create_index(op.f('user_id_created_at_idx'), 'sessions', ['user_id', 'created_at'], unique=False, schema='auth')
    op.create_index(op.f('sessions_user_id_idx'), 'sessions', ['user_id'], unique=False, schema='auth')
    op.create_index(op.f('sessions_oauth_client_id_idx'), 'sessions', ['oauth_client_id'], unique=False, schema='auth')
    op.create_index(op.f('sessions_not_after_idx'), 'sessions', [sa.literal_column('not_after DESC')], unique=False, schema='auth')
    op.create_table('objects',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('bucket_id', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('name', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('owner', sa.UUID(), autoincrement=False, nullable=True, comment='Field is deprecated, use owner_id instead'),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('last_accessed_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('path_tokens', postgresql.ARRAY(sa.TEXT()), sa.Computed("string_to_array(name, '/'::text)", persisted=True), autoincrement=False, nullable=True),
    sa.Column('version', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('owner_id', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('user_metadata', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['bucket_id'], ['storage.buckets.id'], name=op.f('objects_bucketId_fkey')),
    sa.PrimaryKeyConstraint('id', name=op.f('objects_pkey')),
    schema='storage'
    )
    op.create_index(op.f('name_prefix_search'), 'objects', ['name'], unique=False, schema='storage')
    op.create_index(op.f('idx_objects_bucket_id_name_lower'), 'objects', ['bucket_id', sa.literal_column('lower(name)')], unique=False, schema='storage')
    op.create_index(op.f('idx_objects_bucket_id_name'), 'objects', ['bucket_id', 'name'], unique=False, schema='storage')
    op.create_index(op.f('bucketid_objname'), 'objects', ['bucket_id', 'name'], unique=True, schema='storage')
    op.create_table('sso_domains',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('sso_provider_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('domain', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.CheckConstraint('char_length(domain) > 0', name=op.f('domain not empty')),
    sa.ForeignKeyConstraint(['sso_provider_id'], ['auth.sso_providers.id'], name=op.f('sso_domains_sso_provider_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('sso_domains_pkey')),
    schema='auth',
    comment='Auth: Manages SSO email address domain mapping to an SSO Identity Provider.'
    )
    op.create_index(op.f('sso_domains_sso_provider_id_idx'), 'sso_domains', ['sso_provider_id'], unique=False, schema='auth')
    op.create_index(op.f('sso_domains_domain_idx'), 'sso_domains', [sa.literal_column('lower(domain)')], unique=True, schema='auth')
    op.create_table('oauth_clients',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('client_secret_hash', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('registration_type', postgresql.ENUM('dynamic', 'manual', name='oauth_registration_type', schema='auth'), autoincrement=False, nullable=False),
    sa.Column('redirect_uris', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('grant_types', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('client_name', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('client_uri', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('logo_uri', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('deleted_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('client_type', postgresql.ENUM('public', 'confidential', name='oauth_client_type', schema='auth'), server_default=sa.text("'confidential'::auth.oauth_client_type"), autoincrement=False, nullable=False),
    sa.Column('token_endpoint_auth_method', sa.TEXT(), autoincrement=False, nullable=False),
    sa.CheckConstraint("token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])", name=op.f('oauth_clients_token_endpoint_auth_method_check')),
    sa.CheckConstraint('char_length(client_name) <= 1024', name=op.f('oauth_clients_client_name_length')),
    sa.CheckConstraint('char_length(client_uri) <= 2048', name=op.f('oauth_clients_client_uri_length')),
    sa.CheckConstraint('char_length(logo_uri) <= 2048', name=op.f('oauth_clients_logo_uri_length')),
    sa.PrimaryKeyConstraint('id', name=op.f('oauth_clients_pkey')),
    schema='auth'
    )
    op.create_index(op.f('oauth_clients_deleted_at_idx'), 'oauth_clients', ['deleted_at'], unique=False, schema='auth')
    op.create_table('invitations',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('organization_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('invited_by_user_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('email', sa.VARCHAR(), autoincrement=False, nullable=False),
    sa.Column('role', sa.VARCHAR(), server_default=sa.text("'member'::character varying"), autoincrement=False, nullable=False),
    sa.Column('permissions', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('token', sa.VARCHAR(), autoincrement=False, nullable=False),
    sa.Column('accepted', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=True),
    sa.Column('expires_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['invited_by_user_id'], ['users.id'], name=op.f('invitations_invited_by_user_id_fkey'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('invitations_organization_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('invitations_pkey'))
    )
    op.create_index(op.f('ix_invitations_token'), 'invitations', ['token'], unique=True)
    op.create_index(op.f('ix_invitations_organization_id'), 'invitations', ['organization_id'], unique=False)
    op.create_index(op.f('ix_invitations_email'), 'invitations', ['email'], unique=False)
    # ### end Alembic commands ###
