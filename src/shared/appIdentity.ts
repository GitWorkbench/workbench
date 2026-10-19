import packageJson from '../../package.json';

export const APP_NAME = packageJson.productName;
export const APP_SLUG = packageJson.name;
export const PROJECT_REPOSITORY = `${packageJson.build.publish.owner}/${packageJson.build.publish.repo}`;
export const PROJECT_URL = `https://github.com/${PROJECT_REPOSITORY}`;
export const RELEASES_URL = `${PROJECT_URL}/releases`;
