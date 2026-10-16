# Portal architecture

- Keep Mooney World presentation in the portal-local mooney module and stylesheet, consuming the existing portal hooks; this isolates the redesign from separately maintained data, security and admin code.
- Resolve navigation through portal-local helpers targeting registered addresses and preserving View-as scope; routing outside the portal presentation directories is maintained separately.
- Keep room redesigns in world-only components selected by page-level layout switches; preserve classic page bodies so client themes remain isolated.