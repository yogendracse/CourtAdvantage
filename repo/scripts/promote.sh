#!/bin/bash

# Function to display usage
show_usage() {
    echo "Usage: $0 <source_branch> <target_branch>"
    echo "Example: $0 dev qa"
    echo "         $0 qa main"
    exit 1
}

# Check if we have correct number of arguments
if [ "$#" -ne 2 ]; then
    show_usage
fi

SOURCE_BRANCH=$1
TARGET_BRANCH=$2

# Validate branch names
valid_branches=("dev" "qa" "main")
if [[ ! " ${valid_branches[@]} " =~ " ${SOURCE_BRANCH} " ]] || [[ ! " ${valid_branches[@]} " =~ " ${TARGET_BRANCH} " ]]; then
    echo "Error: Source and target branches must be one of: dev, qa, main"
    exit 1
fi

# Validate promotion direction
if [[ "$SOURCE_BRANCH" == "main" ]] || \
   [[ "$SOURCE_BRANCH" == "qa" && "$TARGET_BRANCH" == "dev" ]] || \
   [[ "$SOURCE_BRANCH" == "main" && "$TARGET_BRANCH" == "dev" ]]; then
    echo "Error: Invalid promotion direction. Valid promotions are: dev→qa or qa→main"
    exit 1
fi

# Start promotion process
echo "Starting promotion from $SOURCE_BRANCH to $TARGET_BRANCH..."

# Make sure we're up to date
git fetch origin
git checkout $SOURCE_BRANCH
git pull origin $SOURCE_BRANCH
git checkout $TARGET_BRANCH
git pull origin $TARGET_BRANCH

# Create promotion branch
PROMOTION_BRANCH="promote/${SOURCE_BRANCH}-to-${TARGET_BRANCH}"
git checkout -b $PROMOTION_BRANCH $TARGET_BRANCH

# Merge source into promotion branch
git merge $SOURCE_BRANCH

echo "Promotion branch '$PROMOTION_BRANCH' created and merged with '$SOURCE_BRANCH'"
echo "Next steps:"
echo "1. Review changes"
echo "2. Push the promotion branch: git push origin $PROMOTION_BRANCH"
echo "3. Create a pull request from $PROMOTION_BRANCH to $TARGET_BRANCH" 