// Shared chart sources for the demo page and the Mermaid comparison page.
window.AMD_CHARTS = {
      seq_tiers: `
      sequenceDiagram
        actor Shopper
        participant Web as Web App
        participant GW as API Gateway
        participant Auth as Auth Service
        participant Orders as Orders Service
        participant DB as Postgres

        Shopper->>Web: Checkout
        Web->>GW: POST /orders
        GW->>Auth: Validate token
        Auth-->>GW: Claims OK
        GW->>Orders: Create order
        Orders->>Orders: Validate cart
        Orders->>DB: INSERT order
        DB-->>Orders: Row id 4711
        Orders--xGW: Timeout
        Note over GW,Orders: Gateway retries with backoff
        Orders-->>GW: 201 Created
        GW-->>Web: 201 Created
        Web-->>Shopper: Order confirmed
      `,
      seq: `
      sequenceDiagram
        actor User
        participant App
        participant Backend

        User->>App: Click delete on item
        activate Backend
        App->>Backend: GET resource usage
        Backend-->>App: Returns list with linked record
        deactivate Backend
        alt item has links
          App-->>User: Show dialog with linked record
          User->>App: Click the record link
          Note over App: Router intercepts navigation
          App-->>User: Record editor loads
        else no links
          App-->>User: Delete immediately
        end
      `,
      flow: `
      flowchart TD
        A[Navigate to /items/id] --> B{Editable?}
        B -->|yes| C[Open editor]
        B -->|no| D[Show read-only view]
      `,
      state_composite: `
      stateDiagram-v2
        [*] --> Working
        state Working {
          [*] --> Loading
          Loading --> Saving
        }
        Working --> Idle : done
        Idle --> Working : start
      `,
      flow_click: `
      flowchart TD
        S([Start]) --> B[Validate]
        subgraph Validation
          B --> T{OK?}
        end
        T -->|no| N[Reject]
        T -->|yes| P[Process]
        P --> C((Done))
        N -.-> B
      `,
      seq_click: `
      sequenceDiagram
        actor Client
        participant Server
        Client->>Server: Request
        Server-->>Client: Response
        Client->>Server: Ack
      `,
      journey: `
      journey
        title My working day
        section Go to work
          Make tea: 5: Me
          Go upstairs: 3: Me
          Do work: 1: Me, Cat
        section Go home
          Go downstairs: 5: Me
          Sit down: 7: Me
      `,
      timeline: `
      timeline
        title History of Social Media
        section 2000s
        2002 : LinkedIn
        2004 : Facebook : Google
        2005 : YouTube
        section 2010s
        2010 : Pinterest
        2011 : Snapchat : Twitch
      `,
      class: `
      classDiagram
        class PaymentMethod {
          <<interface>>
          +authorize(amount) bool
          +capture() Receipt
        }
        class Order {
          -OrderStatus status
          +total() Money
          +submit() void
        }
        class OrderLine {
          -int quantity
          +subtotal() Money
        }
        class Product {
          +String sku
          +Money price
        }
        class Coupon {
          +String code
        }
        class Customer {
          +String name
        }
        class CreditCard {
          -String last4
        }
        class PayPal {
          -String account
        }
        class Category {
          +String name
        }
        CreditCard ..|> PaymentMethod
        PayPal ..|> PaymentMethod
        Order "1" *-- "1..*" OrderLine : contains
        Order o-- "0..*" Coupon : applies
        Customer "1" --> "many" Order : places
        Order ..> PaymentMethod : pays via
        OrderLine --> Product : references
        Product "many" --> "1" Category : in
        Category --> Category : parent
      `,
      er: `
      erDiagram
        CUSTOMER ||--o{ ORDER : places
        ORDER ||--|{ LINE_ITEM : contains
        CUSTOMER }|..|{ ADDRESS : uses
        CUSTOMER {
          string name
          string custNumber PK
          string sector
        }
        ORDER {
          int orderNumber PK
          string deliveryAddress FK
        }
      `,
      pie: `
      pie showData
        title Where the bundle bytes go
        "dagre layout" : 24
        "renderers" : 9
        "parsers" : 4
        "controller & themes" : 3
      `,
      gantt: `
      gantt
        title Release 0.5.0
        dateFormat YYYY-MM-DD
        section Build
          Parsers : done, p, 2026-08-25, 3d
          Renderers : done, r, after p, 4d
          Integration : active, i, after r, 2d
        section Ship
          Review : crit, v, after i, 2d
          Demo & docs : after v, 1d
          Publish : milestone, after v, 0d
      `,
      mindmap: `
      mindmap
        root((diagrams))
          Structure
            Flowchart
            Class
            ER
          Time
            Sequence
            Timeline
            Gantt
          Story
            Journey
            Git graph
      `,
      sankey: `
      sankey-beta
        Solar,Grid,40
        Wind,Grid,35
        Gas,Grid,25
        Grid,Homes,55
        Grid,Industry,30
        Grid,Losses,15
      `,
      gitgraph: `
      gitGraph
        commit id: "init"
        commit id: "docs"
        branch develop
        checkout develop
        commit id: "parser"
        commit id: "renderer"
        checkout main
        merge develop tag: "v1.0"
        commit id: "hotfix"
      `,
      architecture: `
      architecture-beta
        group api(cloud)[API]
        service web(server)[Web Server] in api
        service db(database)[Database] in api
        service cache(disk)[Cache] in api
        service dns(internet)[DNS]
        dns:B -- T:web
        web:R -- L:db
        cache:T -- B:db
      `,
    }
