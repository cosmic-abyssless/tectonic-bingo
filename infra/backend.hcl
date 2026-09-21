# Passed to `tofu init "-backend-config=backend.hcl"`. The account id is part of every R2 URL and is not a secret; the
# credentials for the state bucket are AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in the environment.
endpoints = { s3 = "https://662dfb31085e7c9fe04493046d990c20.r2.cloudflarestorage.com" }
