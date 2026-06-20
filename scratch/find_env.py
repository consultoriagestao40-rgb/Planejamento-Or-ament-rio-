import os

def main():
    start_dir = "/Users/cristianosilva/BudgetHub"
    current_dir = start_dir
    while True:
        print(f"Checking directory: {current_dir}")
        for item in os.listdir(current_dir):
            if item.startswith('.env'):
                print(f"  Found: {os.path.join(current_dir, item)}")
        parent_dir = os.path.dirname(current_dir)
        if parent_dir == current_dir:
            break
        current_dir = parent_dir

if __name__ == '__main__':
    main()
