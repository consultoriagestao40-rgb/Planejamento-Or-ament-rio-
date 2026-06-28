import psycopg2

def main():
    try:
        conn = psycopg2.connect(
            host="aws-0-sa-east-1.pooler.supabase.com",
            port=6543,
            user="postgres.ryfshgnyghzrqrsvjkyz",
            password="BudgetHub20250",
            dbname="postgres",
            sslmode="require"
        )
        print("Connected successfully!")
        cursor = conn.cursor()
        
        # Query all categories
        cursor.execute('SELECT id, name, "parentId", "tenantId" FROM "Category"')
        rows = cursor.fetchall()
        
        print(f"Total categories: {len(rows)}")
        
        # Build map
        parents = {}
        names = {}
        for r in rows:
            cat_id, name, parent_id, tenant_id = r
            parents[cat_id] = parent_id
            names[cat_id] = name
            
            # Check self-reference
            if parent_id == cat_id:
                print(f"⚠️ SELF-REFERENCE DETECTED: Category {cat_id} ('{name}') points to itself!")
                
        # Detect cycles recursively
        visited = {}
        path = set()
        
        def has_cycle(node_id):
            if node_id in path:
                # Cycle detected! Print the path
                print(f"🚨 CYCLE DETECTED! Path: {' -> '.join(path)} -> {node_id}")
                return True
            if node_id in visited:
                return visited[node_id]
                
            path.add(node_id)
            parent = parents.get(node_id)
            res = False
            if parent:
                res = has_cycle(parent)
                
            path.remove(node_id)
            visited[node_id] = res
            return res
            
        for node_id in parents:
            has_cycle(node_id)
            
        print("Cycle check complete.")
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
