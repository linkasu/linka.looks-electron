version=$(node -p "'v'+require('./package.json').version")
echo $version
git commit -am $version
git tag $version
git push
git push --tags