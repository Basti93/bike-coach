# Security

Please do not report security issues as a public issue. Use [GitHub's private reporting](https://github.com/Basti93/pandafit/security/advisories/new) instead.

## What the app protects

- The ride service and coach listen only on `127.0.0.1` and check the origin of the connection. Other programs on the same Mac can reach them if they send no origin.
- The Garmin password goes to the helper program only via standard input and is not stored. The access token is stored unencrypted in the data folder.
- Rides, health data and Garmin data are stored unencrypted in the data folder. The coach passes training data, notes and Garmin values to `claude` and thereby to Anthropic.
- The optional sync server is protected by a token and intended only for a private tailnet. It is not built to be openly exposed on the internet.
