# Cropped from backend/open_webui/env.py at
# https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
# Original lines 529-538.
# Optional env vars for creating an admin account on startup
# Useful for headless/automated deployments
WEBUI_ADMIN_EMAIL = os.environ.get('WEBUI_ADMIN_EMAIL', '')
WEBUI_ADMIN_PASSWORD = os.environ.get('WEBUI_ADMIN_PASSWORD', '')
WEBUI_ADMIN_NAME = os.environ.get('WEBUI_ADMIN_NAME', 'Admin')

WEBUI_AUTH_TRUSTED_EMAIL_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_EMAIL_HEADER', None)
WEBUI_AUTH_TRUSTED_NAME_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_NAME_HEADER', None)
WEBUI_AUTH_TRUSTED_GROUPS_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_GROUPS_HEADER', None)
WEBUI_AUTH_TRUSTED_ROLE_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_ROLE_HEADER', None)
