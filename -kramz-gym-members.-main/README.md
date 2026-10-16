# Kramz Gym Members

A browser-based gym membership tracker with QR check-in, payment history, and revenue reports.

When recording a payment, choose the renewal start date to set when the new membership period begins. The date defaults to today, or the day after the current expiry for an active membership.

Member payment history shows the selected renewal start date. The Revenue report shows when each payment was recorded.

## Run locally

Open `gym-members.html` with the VS Code Live Server extension, or serve this folder from any local web server. Use `localhost` or HTTPS for camera access.

## Data and privacy

Member and sales data are stored in IndexedDB in the current browser and are not synchronized between devices. Use **Download backup** to export members and sales, and **Restore backup** to import them on another device.

The Revenue PIN is a browser-local privacy gate, not secure authentication. Do not use this app's public GitHub Pages deployment to store real member information; anyone can access the public app, and client-side PIN checks are not server security.
